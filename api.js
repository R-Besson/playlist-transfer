// A standard track object, now with duration.
const createTrackObject = (title, artist, album = '', duration = 0) => ({
    title,
    artist,
    album,
    duration
});

// --- LEVENSHTEIN DISTANCE: For smart string comparison ---
const _getLevenshteinDistance = (a, b) => {
    if (!a || !b) return 999;
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i += 1) {
        matrix[0][i] = i;
    }
    for (let j = 0; j <= b.length; j += 1) {
        matrix[j][0] = j;
    }
    for (let j = 1; j <= b.length; j += 1) {
        for (let i = 1; i <= a.length; i += 1) {
            const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + indicator);
        }
    }
    return matrix[b.length][a.length];
};

// --- ENHANCED CLEANING: More selectively removes junk text ---
const _cleanString = (str) => {
    if (!str) return '';
    const junkKeywords = ['official', 'music', 'lyric', 'visualizer', 'audio', 'video', 'hd', '4k', 'remastered', 'remaster', 'remix', 'edit', 'version', 'live', 'unplugged', 'acoustic', 'extended', 'radio'];
    const junkRegex = new RegExp(`\\b(${junkKeywords.join('|')})(\\s\\d{4})?\\b`, 'gi');
    return str.replace(junkRegex, '').replace(/\(feat\..*?\)/i, '').replace(/ft\..*/i, '').replace(/[()\[\]{}]/g, '').trim();
};

const parseYoutubeTitle = (videoData) => {
    const title = videoData.snippet.title;
    const channel = videoData.snippet.channelTitle;
    const separators = [' - ', ' – ', ' -- ', ' by '];
    for (const sep of separators) {
        if (title.includes(sep)) {
            const parts = title.split(sep);
            return {
                artist: parts[0].trim(),
                title: parts.slice(1).join(sep).trim()
            };
        }
    }
    const cleanedChannel = channel.replace(/ - Topic$/, '').replace(/VEVO$/, '').trim();
    return {
        artist: cleanedChannel,
        title: title
    };
};

const _parseISODuration = (isoDuration) => {
    const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = isoDuration.match(regex);
    const hours = parseInt(matches[1] || 0);
    const minutes = parseInt(matches[2] || 0);
    const seconds = parseInt(matches[3] || 0);
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
};


const API = {
    spotify: {},
    youtube: {},
    applemusic: {
        bearerToken: null,
        mediaUserToken: null,
        countryCode: 'us',

        configure(creds) {
            this.bearerToken = creds.bearer;
            this.mediaUserToken = creds.mediaUser;
            this.countryCode = creds.countryCode || 'us';
        },

        _xhrRequest(method, url, headers = {}, body = null) {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open(method, url, true);
                xhr.withCredentials = true;

                for (const key in headers) {
                    xhr.setRequestHeader(key, headers[key]);
                }
                xhr.onload = () => {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        if (xhr.status >= 200 && xhr.status < 300) {
                            resolve(response);
                        } else {
                            reject({
                                status: xhr.status,
                                response
                            });
                        }
                    } catch (e) {
                        reject({
                            status: xhr.status,
                            response: xhr.responseText
                        });
                    }
                };
                xhr.onerror = () => reject({
                    status: xhr.status,
                    statusText: xhr.statusText
                });
                xhr.send(body ? JSON.stringify(body) : null);
            });
        },

        async _searchiTunes(track) {
            const BASE_URL = `https://itunes.apple.com/search?country=${this.countryCode}&media=music&entity=song&limit=5&term=`;
            const queries = [`${track.title} ${track.artist} ${track.album}`, `${track.title} ${track.artist}`, `${track.title}`];
            for (const query of queries) {
                try {
                    const url = BASE_URL + encodeURIComponent(query);
                    // Use a simple fetch for the public iTunes API
                    const res = await fetch(url);
                    if (!res.ok) continue;
                    const data = await res.json();
                    if (data.resultCount > 0) {
                        for (const result of data.results) {
                            if (result.trackName.toLowerCase() === track.title.toLowerCase() && result.artistName.toLowerCase() === track.artist.toLowerCase()) {
                                return result.trackId;
                            }
                        }
                        return data.results[0].trackId;
                    }
                } catch (e) {
                    console.warn(`iTunes search failed for query: ${query}`, e);
                }
            }
            return null;
        },

        async createPlaylist(playlistName, tracks, logFn) {
            const ampHeaders = {
                'Authorization': this.bearerToken,
                'media-user-token': this.mediaUserToken,
                'Content-Type': 'application/json'
                // The Cookie header is no longer set here.
            };
            let playlistId = null;
            try {
                const existingPlaylists = await this._xhrRequest('GET', 'https://amp-api.music.apple.com/v1/me/library/playlists', ampHeaders);
                const existing = existingPlaylists.data.find(p => p.attributes.name === playlistName);
                if (existing) {
                    logFn(`Playlist "${playlistName}" already exists.`, 'info');
                    playlistId = existing.id;
                }
            } catch (e) {
                /* Ignore */ }
            if (!playlistId) {
                logFn(`Creating new playlist: "${playlistName}"`, 'info');
                const createData = {
                    attributes: {
                        name: playlistName,
                        description: 'Transferred by Playlist Porter'
                    }
                };
                try {
                    const newPlaylistData = await this._xhrRequest('POST', 'https://amp-api.music.apple.com/v1/me/library/playlists', ampHeaders, createData);
                    playlistId = newPlaylistData.data[0].id;
                } catch (e) {
                    if (e.status === 401 || e.status === 403) {
                        throw new Error("Apple Music authorization failed. Please check your Bearer and Media User Tokens.");
                    }
                    throw new Error(`Failed to create Apple Music playlist. Status: ${e.status}`);
                }
            }
            for (const track of tracks) {
                const itunesId = await this._searchiTunes(track);
                if (itunesId) {
                    try {
                        const addData = {
                            data: [{
                                id: `${itunesId}`,
                                type: 'songs'
                            }]
                        };
                        await this._xhrRequest('POST', `https://amp-api.music.apple.com/v1/me/library/playlists/${playlistId}/tracks`, ampHeaders, addData);
                        logFn(`Added: ${track.title} - ${track.artist}`, 'success');
                    } catch (e) {
                        logFn(`Error adding ${track.title}: ${e.response?.errors?.[0]?.title || 'Unknown Error'}`, 'error');
                    }
                } else {
                    logFn(`Not Found: ${track.title} - ${track.artist}`, 'error');
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            return `https://music.apple.com/library/playlist/${playlistId}`;
        }
    }
};

// Re-pasting unchanged functions for completeness
API.spotify = {
    accessToken: null,
    clientId: null,
    async _generateCodeChallenge(codeVerifier) {
        const data = new TextEncoder().encode(codeVerifier);
        const digest = await window.crypto.subtle.digest('SHA-256', data);
        return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)])).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    _generateCodeVerifier(length) {
        let text = '';
        let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
        for (let i = 0; i < length; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    },
    async authenticate(clientId) {
        this.clientId = clientId;
        const verifier = this._generateCodeVerifier(128);
        const challenge = await this._generateCodeChallenge(verifier);
        localStorage.setItem("spotify_code_verifier", verifier);
        const params = new URLSearchParams({
            client_id: clientId,
            response_type: "code",
            redirect_uri: window.location.origin + window.location.pathname,
            scope: "playlist-read-private playlist-modify-public playlist-modify-private",
            code_challenge_method: "S256",
            code_challenge: challenge,
        });
        document.location = `https://accounts.spotify.com/authorize?${params.toString()}`;
    },
    async handleAuthRedirect() {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        if (!code) return false;
        const verifier = localStorage.getItem("spotify_code_verifier");
        if (!verifier) throw new Error("Spotify code verifier not found.");
        const tokenParams = new URLSearchParams({
            client_id: this.clientId,
            grant_type: "authorization_code",
            code: code,
            redirect_uri: window.location.origin + window.location.pathname,
            code_verifier: verifier,
        });
        const result = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: tokenParams
        });
        if (!result.ok) throw new Error("Failed to get Spotify token: " + await result.text());
        const {
            access_token
        } = await result.json();
        this.accessToken = access_token;
        localStorage.removeItem("spotify_code_verifier");
        const url = new URL(window.location.href);
        url.search = '';
        window.history.replaceState({}, '', url);
        return true;
    },
    setAccessToken(token) {
        this.accessToken = token;
    },
    async _fetch(endpoint, method = 'GET', body = null, logFn = () => {}) {
        if (!this.accessToken) throw new Error("Spotify access token is missing.");
        while (true) {
            try {
                const res = await fetch(`https://api.spotify.com/v1/${endpoint}`, {
                    method,
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: body ? JSON.stringify(body) : null
                });
                if (res.ok) {
                    if (res.status === 204) return null;
                    return res.json();
                }
                if (res.status === 429) {
                    const retryAfter = res.headers.get('Retry-After') || '5';
                    const waitMs = parseInt(retryAfter) * 1000;
                    logFn(`Rate limited by Spotify. Waiting for ${retryAfter} seconds...`, 'info');
                    await new Promise(resolve => setTimeout(resolve, waitMs));
                    continue;
                }
                throw new Error(`Spotify API Error (${res.status}): ${res.statusText}`);
            } catch (error) {
                console.error("Fetch failed:", error);
                throw error;
            }
        }
    },
    async getPlaylist(playlistUrl) {
        const playlistId = playlistUrl.split('/').pop().split('?')[0];
        const playlistInfo = await this._fetch(`playlists/${playlistId}?fields=name,public`);
        if (playlistInfo.public === false) {
            throw new Error("The source Spotify playlist is not public.");
        }
        let tracks = [];
        let nextUrl = `playlists/${playlistId}/tracks?limit=50&fields=items(track(name,artists(name),album(name),duration_ms)),next`;
        while (nextUrl) {
            const data = await this._fetch(nextUrl);
            tracks.push(...data.items.filter(i => i && i.track).map(i => createTrackObject(i.track.name, i.track.artists[0].name, i.track.album.name, i.track.duration_ms)));
            nextUrl = data.next ? data.next.replace('https://api.spotify.com/v1/', '') : null;
        }
        return {
            name: playlistInfo.name,
            tracks
        };
    },
    async createPlaylist(playlistName, tracks, logFn, useFastTransfer = true) {
        const user = await this._fetch('me', 'GET', null, logFn);
        const newPlaylist = await this._fetch(`users/${user.id}/playlists`, 'POST', {
            name: playlistName,
            description: `Transferred by Playlist Porter`,
            public: false
        }, logFn);
        if (!newPlaylist || !newPlaylist.id) {
            throw new Error("Failed to create Spotify playlist; response was empty.");
        }
        const findBestMatch = (sourceTrack, searchResults, durationTolerance) => {
            let bestMatch = null;
            let lowestScore = Infinity;
            const cleanedSourceTitle = _cleanString(sourceTrack.title).toLowerCase();
            const cleanedSourceArtist = _cleanString(sourceTrack.artist).toLowerCase();
            for (const resultTrack of searchResults) {
                const durationDiff = Math.abs(sourceTrack.duration - resultTrack.duration_ms);
                if (durationDiff <= durationTolerance) {
                    const cleanedResultTitle = _cleanString(resultTrack.name).toLowerCase();
                    const cleanedResultArtist = _cleanString(resultTrack.artists[0].name).toLowerCase();
                    const titleScore = _getLevenshteinDistance(cleanedSourceTitle, cleanedResultTitle);
                    const artistScore = _getLevenshteinDistance(cleanedSourceArtist, cleanedResultArtist);
                    const totalScore = titleScore + (artistScore * 1.5);
                    if (totalScore < lowestScore) {
                        lowestScore = totalScore;
                        bestMatch = resultTrack;
                    }
                }
            }
            return bestMatch;
        };
        const findTrackPromise = async (track) => {
            const cleanedTitle = _cleanString(track.title);
            const cleanedArtist = _cleanString(track.artist);
            const cleanedAlbum = _cleanString(track.album);
            let match = null;
            if (cleanedAlbum) {
                let query = `track:${cleanedTitle} artist:${cleanedArtist} album:${cleanedAlbum}`;
                let searchResult = await this._fetch(`search?q=${encodeURIComponent(query)}&type=track&limit=5`, 'GET', null, logFn);
                if (searchResult.tracks.items.length > 0) {
                    match = findBestMatch(track, searchResult.tracks.items, 5000);
                }
            }
            if (!match) {
                let query = `track:${cleanedTitle} artist:${cleanedArtist}`;
                let searchResult = await this._fetch(`search?q=${encodeURIComponent(query)}&type=track&limit=5`, 'GET', null, logFn);
                if (searchResult.tracks.items.length > 0) {
                    match = findBestMatch(track, searchResult.tracks.items, 7000);
                }
            }
            if (!match) {
                let query = `${cleanedArtist} ${cleanedTitle}`;
                let searchResult = await this._fetch(`search?q=${encodeURIComponent(query)}&type=track&limit=5`, 'GET', null, logFn);
                if (searchResult.tracks.items.length > 0) {
                    match = findBestMatch(track, searchResult.tracks.items, track.duration * 0.15);
                }
            }
            if (match) {
                logFn(`Found: ${track.title} - ${track.artist}`, 'success');
                return match.uri;
            } else {
                logFn(`Not Found: ${track.title} - ${track.artist}`, 'error');
                return null;
            }
        };
        const BATCH_SIZE = 10;
        let allFoundUris = [];
        for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
            const batch = tracks.slice(i, i + BATCH_SIZE);
            const promises = batch.map(track => findTrackPromise(track));
            const results = await Promise.all(promises);
            allFoundUris.push(...results.filter(uri => uri !== null));
        }
        if (allFoundUris.length > 0) {
            for (let i = 0; i < allFoundUris.length; i += 100) {
                await this._fetch(`playlists/${newPlaylist.id}/tracks`, 'POST', {
                    uris: allFoundUris.slice(i, i + 100)
                }, logFn);
            }
        }
        return newPlaylist.external_urls.spotify;
    }
};
API.youtube = {
    tokenClient: null,
    async configure(apiKey) {
        await new Promise((resolve) => gapi.load('client', resolve));
        await gapi.client.init({});
        gapi.client.setApiKey(apiKey);
        await gapi.client.load('https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest');
    },
    authenticate(clientId) {
        return new Promise((resolve, reject) => {
            this.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: 'https://www.googleapis.com/auth/youtube',
                callback: (tokenResponse) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        gapi.client.setToken(tokenResponse);
                        resolve(true);
                    } else {
                        reject(new Error("Google authentication failed. No access token received."));
                    }
                },
                error_callback: (error) => {
                    reject(new Error(`Google authentication error: ${error.details || error.type}`));
                }
            });
            this.tokenClient.requestAccessToken();
        });
    },
    async getPlaylist(playlistUrl) {
        const params = new URLSearchParams(new URL(playlistUrl).search);
        const playlistId = params.get('list');
        if (!playlistId) throw new Error("Invalid YouTube URL. Missing 'list' parameter.");
        const playlistInfoResponse = await gapi.client.youtube.playlists.list({
            part: 'snippet',
            id: playlistId
        });
        const playlistInfo = playlistInfoResponse.result.items[0];
        if (!playlistInfo) throw new Error("The source YouTube playlist does not exist.");
        const playlistName = playlistInfo.snippet.title;
        let videoIds = [];
        let nextPageToken = null;
        do {
            const response = await gapi.client.youtube.playlistItems.list({
                part: 'contentDetails',
                playlistId: playlistId,
                maxResults: 50,
                pageToken: nextPageToken
            });
            videoIds.push(...response.result.items.map(item => item.contentDetails.videoId));
            nextPageToken = response.result.nextPageToken;
        } while (nextPageToken);
        let tracks = [];
        for (let i = 0; i < videoIds.length; i += 50) {
            const idBatch = videoIds.slice(i, i + 50);
            const videosResponse = await gapi.client.youtube.videos.list({
                part: 'snippet,contentDetails',
                id: idBatch.join(',')
            });
            videosResponse.result.items.forEach(videoData => {
                const {
                    title,
                    artist
                } = parseYoutubeTitle(videoData);
                const duration = _parseISODuration(videoData.contentDetails.duration);
                tracks.push(createTrackObject(title, artist, '', duration));
            });
        }
        return {
            name: playlistName,
            tracks
        };
    },
    async createPlaylist(playlistName, tracks, logFn, useFastTransfer = false) {
        const newPlaylist = await gapi.client.youtube.playlists.insert({
            part: 'snippet,status',
            resource: {
                snippet: {
                    title: playlistName,
                    description: `Transferred by Playlist Porter`
                },
                status: {
                    privacyStatus: 'private'
                }
            }
        });
        const playlistId = newPlaylist.result.id;
        const findVideoAndAddToPlaylist = async (track) => {
            try {
                const cleanedTitle = _cleanString(track.title);
                const cleanedArtist = _cleanString(track.artist);
                const query = `${cleanedArtist} ${cleanedTitle}`;
                const search = await gapi.client.youtube.search.list({
                    part: 'snippet',
                    q: query,
                    type: 'video',
                    maxResults: 1
                });
                const firstResult = search.result.items[0];
                if (firstResult && firstResult.id && firstResult.id.videoId) {
                    const videoId = firstResult.id.videoId;
                    await gapi.client.youtube.playlistItems.insert({
                        part: 'snippet',
                        resource: {
                            snippet: {
                                playlistId: playlistId,
                                resourceId: {
                                    kind: 'youtube#video',
                                    videoId: videoId
                                }
                            }
                        }
                    });
                    logFn(`Added: ${track.title} - ${track.artist}`, 'success');
                } else {
                    logFn(`Not Found: ${track.title} - ${track.artist}`, 'error');
                }
            } catch (e) {
                const message = e.result ? e.result.error.message : e.message;
                logFn(`API Error for ${track.title}: ${message}`, 'error');
                if (e.result && e.result.error && e.result.error.code === 403) {
                    const isQuotaError = e.result.error.errors.some(err => err.reason === 'quotaExceeded');
                    if (isQuotaError) throw new Error('YOUTUBE_QUOTA_EXCEEDED');
                }
            }
        };
        if (useFastTransfer) {
            logFn('Using Fast Transfer mode (High Quota Usage).', 'info');
            const BATCH_SIZE = 10;
            for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
                const batch = tracks.slice(i, i + BATCH_SIZE);
                const promises = batch.map(track => findVideoAndAddToPlaylist(track));
                try {
                    await Promise.all(promises);
                } catch (e) {
                    if (e.message === 'YOUTUBE_QUOTA_EXCEEDED') {
                        logFn('YouTube quota exceeded. Halting transfer.', 'error');
                        break;
                    }
                    throw e;
                }
            }
        } else {
            logFn('Using Quota-Saver mode (Slower).', 'info');
            for (const track of tracks) {
                try {
                    await findVideoAndAddToPlaylist(track);
                } catch (e) {
                    if (e.message === 'YOUTUBE_QUOTA_EXCEEDED') {
                        logFn('YouTube quota exceeded. Halting transfer.', 'error');
                        break;
                    }
                    throw e;
                }
            }
        }
        return `https://www.youtube.com/playlist?list=${playlistId}`;
    }
};