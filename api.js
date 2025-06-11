const createTrackObject = (title, artist, album = "", duration = 0) => ({
	title,
	artist,
	album,
	duration,
});
const _getLevenshteinDistance = (a, b) => {
	if (!a || !b) return 999;
	const matrix = Array(b.length + 1)
		.fill(null)
		.map(() => Array(a.length + 1).fill(null));
	for (let i = 0; i <= a.length; i += 1) {
		matrix[0][i] = i;
	}
	for (let j = 0; j <= b.length; j += 1) {
		matrix[j][0] = j;
	}
	for (let j = 1; j <= b.length; j += 1) {
		for (let i = 1; i <= a.length; i += 1) {
			const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
			matrix[j][i] = Math.min(
				matrix[j][i - 1] + 1,
				matrix[j - 1][i] + 1,
				matrix[j - 1][i - 1] + indicator
			);
		}
	}
	return matrix[b.length][a.length];
};
const _cleanString = (str) => {
	if (!str) return "";
	const junkKeywords = [
		"official",
		"music",
		"lyric",
		"visualizer",
		"audio",
		"video",
		"hd",
		"4k",
		"remastered",
		"remaster",
		"remix",
		"edit",
		"version",
		"live",
		"unplugged",
		"acoustic",
		"extended",
		"radio",
	];
	const junkRegex = new RegExp(
		`\\b(${junkKeywords.join("|")})(\\s\\d{4})?\\b`,
		"gi"
	);
	return str
		.replace(junkRegex, "")
		.replace(/\(feat\..*?\)/i, "")
		.replace(/ft\..*/i, "")
		.replace(/[()\[\]{}]/g, "")
		.trim();
};
const parseYoutubeTitle = (videoData) => {
	const title = videoData.snippet.title;
	const channel = videoData.snippet.channelTitle;
	const separators = [" - ", " – ", " -- ", " by "];
	for (const sep of separators) {
		if (title.includes(sep)) {
			const parts = title.split(sep);
			return {
				artist: parts[0].trim(),
				title: parts.slice(1).join(sep).trim(),
			};
		}
	}
	const cleanedChannel = channel
		.replace(/ - Topic$/, "")
		.replace(/VEVO$/, "")
		.trim();
	return { artist: cleanedChannel, title: title };
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
	spotify: {
		accessToken: null,
		clientId: null,
		async _generateCodeChallenge(codeVerifier) {
			const data = new TextEncoder().encode(codeVerifier);
			const digest = await window.crypto.subtle.digest("SHA-256", data);
			return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
				.replace(/\+/g, "-")
				.replace(/\//g, "_")
				.replace(/=+$/, "");
		},
		_generateCodeVerifier(length) {
			let text = "";
			let possible =
				"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
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
				scope:
					"playlist-read-private playlist-modify-public playlist-modify-private",
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
				code,
				redirect_uri: window.location.origin + window.location.pathname,
				code_verifier: verifier,
			});
			const result = await fetch("https://accounts.spotify.com/api/token", {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: tokenParams,
			});
			if (!result.ok)
				throw new Error(
					"Failed to get Spotify token: " + (await result.text())
				);
			const { access_token } = await result.json();
			this.accessToken = access_token;
			localStorage.removeItem("spotify_code_verifier");
			const url = new URL(window.location.href);
			url.search = "";
			window.history.replaceState({}, "", url);
			return true;
		},
		setAccessToken(token) {
			this.accessToken = token;
		},
		async _fetch(endpoint, method = "GET", body = null, logFn = () => {}) {
			if (!this.accessToken)
				throw new Error("Spotify access token is missing.");
			while (true) {
				try {
					const res = await fetch(`https://api.spotify.com/v1/${endpoint}`, {
						method,
						headers: {
							Authorization: `Bearer ${this.accessToken}`,
							"Content-Type": "application/json",
						},
						body: body ? JSON.stringify(body) : null,
					});
					if (res.ok) {
						if (res.status === 204) return null;
						return res.json();
					}
					if (res.status === 429) {
						const retryAfter = res.headers.get("Retry-After") || "5";
						const waitMs = parseInt(retryAfter) * 1000;
						logFn(
							`Rate limited by Spotify. Waiting for ${retryAfter} seconds...`,
							"info"
						);
						await new Promise((resolve) => setTimeout(resolve, waitMs));
						continue;
					}
					throw new Error(
						`Spotify API Error (${res.status}): ${res.statusText}`
					);
				} catch (error) {
					console.error("Fetch failed:", error);
					throw error;
				}
			}
		},
		async getPlaylist(playlistUrl) {
			const playlistId = playlistUrl.split("/").pop().split("?")[0];
			const playlistInfo = await this._fetch(
				`playlists/${playlistId}?fields=name,public`
			);
			if (playlistInfo.public === false) {
				throw new Error("The source Spotify playlist is not public.");
			}
			let tracks = [];
			let nextUrl = `playlists/${playlistId}/tracks?limit=50&fields=items(track(name,artists(name),album(name),duration_ms)),next`;
			while (nextUrl) {
				const data = await this._fetch(nextUrl);
				tracks.push(
					...data.items
						.filter((i) => i && i.track)
						.map((i) =>
							createTrackObject(
								i.track.name,
								i.track.artists[0].name,
								i.track.album.name,
								i.track.duration_ms
							)
						)
				);
				nextUrl = data.next
					? data.next.replace("https://api.spotify.com/v1/", "")
					: null;
			}
			return { name: playlistInfo.name, tracks };
		},
		async createPlaylist(playlistName, tracks, logFn) {
			const user = await this._fetch("me", "GET", null, logFn);
			const newPlaylist = await this._fetch(
				`users/${user.id}/playlists`,
				"POST",
				{
					name: playlistName,
					description: `Transferred by https://r-besson.github.io/playlist-transfer/`,
					public: false,
				},
				logFn
			);
			if (!newPlaylist || !newPlaylist.id) {
				throw new Error(
					"Failed to create Spotify playlist; response was empty."
				);
			}

			const findSpotifyUri = async (track, index) => {
				const getBestMatch = (sourceTrack, searchResults) => {
					const cleanedSourceTitle = _cleanString(
						sourceTrack.title
					).toLowerCase();
					const cleanedSourceArtist = _cleanString(
						sourceTrack.artist
					).toLowerCase();
					let bestMatch = null;
					let lowestScore = Infinity;
					for (const resultTrack of searchResults) {
						if (
							sourceTrack.duration &&
							Math.abs(sourceTrack.duration - resultTrack.duration_ms) > 15000
						)
							continue;
						const cleanedResultTitle = _cleanString(
							resultTrack.name
						).toLowerCase();
						const cleanedResultArtist = _cleanString(
							resultTrack.artists[0].name
						).toLowerCase();
						const titleScore = _getLevenshteinDistance(
							cleanedSourceTitle,
							cleanedResultTitle
						);
						const artistScore = _getLevenshteinDistance(
							cleanedSourceArtist,
							cleanedResultArtist
						);
						const totalScore = titleScore + artistScore * 1.5;
						if (totalScore < lowestScore) {
							lowestScore = totalScore;
							bestMatch = resultTrack;
						}
					}
					return bestMatch;
				};

				const cleanedTitle = _cleanString(track.title);
				const cleanedArtist = _cleanString(track.artist);
				const cleanedAlbum = _cleanString(track.album);
				let potentialMatches = [];
				try {
					if (cleanedAlbum) {
						const result = await this._fetch(
							`search?q=${encodeURIComponent(
								`track:${cleanedTitle} artist:${cleanedArtist} album:${cleanedAlbum}`
							)}&type=track&limit=5`,
							"GET",
							null,
							logFn
						);
						if (result.tracks.items.length > 0)
							potentialMatches.push(...result.tracks.items);
					}
					const result2 = await this._fetch(
						`search?q=${encodeURIComponent(
							`track:${cleanedTitle} artist:${cleanedArtist}`
						)}&type=track&limit=5`,
						"GET",
						null,
						logFn
					);
					if (result2.tracks.items.length > 0)
						potentialMatches.push(...result2.tracks.items);
					if (potentialMatches.length === 0) {
						const result3 = await this._fetch(
							`search?q=${encodeURIComponent(
								`${cleanedArtist} ${cleanedTitle}`
							)}&type=track&limit=5`,
							"GET",
							null,
							logFn
						);
						if (result3.tracks.items.length > 0)
							potentialMatches.push(...result3.tracks.items);
					}
					const bestMatch = getBestMatch(track, potentialMatches);
					if (bestMatch) {
						logFn(
							`  ✔ Found: ${bestMatch.name} - ${bestMatch.artists[0].name}`,
							"success"
						);
						return { index, uri: bestMatch.uri };
					}
				} catch (e) {
					logFn(
						`  ✖ API Error searching for ${track.title}: ${e.message}`,
						"error"
					);
				}
				logFn(`  ✖ Not Found: ${track.title} - ${track.artist}`, "error");
				return { index, uri: null, originalTrack: track };
			};

			logFn(
				`--- Phase 1: Searching for ${tracks.length} tracks... ---`,
				"info"
			);
			const allSearchResults = [];
			const BATCH_SIZE = 10;
			for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
				logFn(`Searching batch ${i / BATCH_SIZE + 1}...`, "info");
				const batch = tracks.slice(i, i + BATCH_SIZE);
				const promises = batch.map((track, j) => findSpotifyUri(track, i + j));
				const batchResults = await Promise.all(promises);
				allSearchResults.push(...batchResults);
			}

			const foundUris = allSearchResults
				.filter((r) => r.uri)
				.sort((a, b) => a.index - b.index)
				.map((r) => r.uri);
			const notFoundTracks = allSearchResults
				.filter((r) => !r.uri)
				.map((r) => r.originalTrack);

			logFn(
				`--- Phase 2: Adding ${foundUris.length} found tracks to playlist... ---`,
				"info"
			);
			if (foundUris.length > 0) {
				for (let i = 0; i < foundUris.length; i += 100) {
					await this._fetch(
						`playlists/${newPlaylist.id}/tracks`,
						"POST",
						{ uris: foundUris.slice(i, i + 100) },
						logFn
					);
				}
			}

			logFn(`--- Transfer Complete ---`, "info");
			logFn(`Successfully added: ${foundUris.length}`, "success");
			logFn(`Not found: ${notFoundTracks.length}`, "error", notFoundTracks);

			return newPlaylist.external_urls.spotify;
		},
	},

	youtube: {
		tokenClient: null,
		async configure(apiKey) {
			await new Promise((resolve) => gapi.load("client", resolve));
			await gapi.client.init({});
			gapi.client.setApiKey(apiKey);
			await gapi.client.load(
				"https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest"
			);
		},
		authenticate(clientId) {
			return new Promise((resolve, reject) => {
				this.tokenClient = google.accounts.oauth2.initTokenClient({
					client_id: clientId,
					scope: "https://www.googleapis.com/auth/youtube",
					callback: (tokenResponse) => {
						if (tokenResponse && tokenResponse.access_token) {
							gapi.client.setToken(tokenResponse);
							resolve(true);
						} else {
							reject(
								new Error(
									"Google authentication failed. No access token received."
								)
							);
						}
					},
					error_callback: (error) => {
						reject(
							new Error(
								`Google authentication error: ${error.details || error.type}`
							)
						);
					},
				});
				this.tokenClient.requestAccessToken();
			});
		},
		async getPlaylist(playlistUrl) {
			const params = new URLSearchParams(new URL(playlistUrl).search);
			const playlistId = params.get("list");
			if (!playlistId)
				throw new Error("Invalid YouTube URL. Missing 'list' parameter.");

			const playlistInfoResponse = await gapi.client.youtube.playlists.list({
				part: "snippet",
				id: playlistId,
			});
			const playlistInfo = playlistInfoResponse.result.items[0];
			if (!playlistInfo)
				throw new Error("The source YouTube playlist does not exist.");
			const playlistName = playlistInfo.snippet.title;

			let videoIds = [];
			let nextPageToken = null;
			do {
				const response = await gapi.client.youtube.playlistItems.list({
					part: "contentDetails",
					playlistId,
					maxResults: 50,
					pageToken: nextPageToken,
				});
				videoIds.push(
					...response.result.items.map((item) => item.contentDetails.videoId)
				);
				nextPageToken = response.result.nextPageToken;
			} while (nextPageToken);

			let tracks = [];
			for (let i = 0; i < videoIds.length; i += 50) {
				const idBatch = videoIds.slice(i, i + 50);
				const videosResponse = await gapi.client.youtube.videos.list({
					part: "snippet,contentDetails",
					id: idBatch.join(","),
				});
				videosResponse.result.items.forEach((videoData) => {
					const { title, artist } = parseYoutubeTitle(videoData);
					const duration = _parseISODuration(videoData.contentDetails.duration);
					tracks.push(createTrackObject(title, artist, "", duration));
				});
			}
			return { name: playlistName, tracks };
		},
		async createPlaylist(playlistName, tracks, logFn) {
			const newPlaylist = await gapi.client.youtube.playlists.insert({
				part: "snippet,status",
				resource: {
					snippet: {
						title: playlistName,
						description: `Transferred by https://r-besson.github.io/playlist-transfer/`,
					},
					status: { privacyStatus: "private" },
				},
			});
			const playlistId = newPlaylist.result.id;

			const findVideoId = async (track, index) => {
				const cleanedTitle = _cleanString(track.title);
				const cleanedArtist = _cleanString(track.artist);
				const query = `${cleanedArtist} ${cleanedTitle}`;
				try {
					const search = await gapi.client.youtube.search.list({
						part: "snippet",
						q: query,
						type: "video",
						maxResults: 5,
					});
					if (search.result.items && search.result.items.length > 0) {
						const videoId = search.result.items[0].id.videoId;
						logFn(
							`  ✔ Found: ${search.result.items[0].snippet.title}`,
							"success"
						);
						return { index, videoId };
					}
				} catch (e) {
					const message = e.result ? e.result.error.message : e.message;
					logFn(`  ✖ API Search Error for ${track.title}: ${message}`, "error");
					if (
						e.result?.error?.errors.some(
							(err) => err.reason === "quotaExceeded"
						)
					)
						throw new Error("YOUTUBE_QUOTA_EXCEEDED");
				}
				logFn(`  ✖ Not Found: ${track.title} - ${track.artist}`, "error");
				return { index, videoId: null, originalTrack: track };
			};

			logFn(
				`--- Phase 1: Searching for ${tracks.length} videos... ---`,
				"info"
			);
			const allSearchResults = [];
			const BATCH_SIZE = 10;
			try {
				for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
					logFn(`Searching batch ${i / BATCH_SIZE + 1}...`, "info");
					const batch = tracks.slice(i, i + BATCH_SIZE);
					const promises = batch.map((track, j) => findVideoId(track, i + j));
					allSearchResults.push(...(await Promise.all(promises)));
				}
			} catch (e) {
				if (e.message === "YOUTUBE_QUOTA_EXCEEDED") {
					logFn(
						"YouTube quota exceeded mid-search. Adding found videos before stopping.",
						"error"
					);
				} else {
					throw e;
				}
			}

			const foundVideos = allSearchResults
				.filter((r) => r.videoId)
				.sort((a, b) => a.index - b.index);
			const notFoundTracks = allSearchResults
				.filter((r) => !r.videoId)
				.map((r) => r.originalTrack);

			logFn(
				`--- Phase 2: Adding ${foundVideos.length} found videos to playlist... ---`,
				"info"
			);
			for (const [i, video] of foundVideos.entries()) {
				try {
					await gapi.client.youtube.playlistItems.insert({
						part: "snippet",
						resource: {
							snippet: {
								playlistId,
								resourceId: { kind: "youtube#video", videoId: video.videoId },
							},
						},
					});
				} catch (e) {
					logFn(
						`Failed to add video ${i + 1}/${
							foundVideos.length
						}. It may already be in the playlist or another issue occurred.`,
						"error"
					);
					if (
						e.result?.error?.errors.some(
							(err) => err.reason === "quotaExceeded"
						)
					)
						throw new Error("YOUTUBE_QUOTA_EXCEEDED");
				}
			}

			logFn(`--- Transfer Complete ---`, "info");
			logFn(`Successfully added: ${foundVideos.length}`, "success");
			logFn(`Not found: ${notFoundTracks.length}`, "error", notFoundTracks);

			return `https://www.youtube.com/playlist?list=${playlistId}`;
		},
	},

	applemusic: {
		bearerToken: null,
		mediaUserToken: null,
		_xhrRequest: function (method, url, headers = {}, body = null) {
			return new Promise((resolve, reject) => {
				const xhr = new XMLHttpRequest();
				xhr.open(method, url, true);
				xhr.withCredentials = true;
				for (const key in headers) {
					xhr.setRequestHeader(key, headers[key]);
				}
				xhr.onload = () => {
					if (xhr.status === 204) {
						resolve({});
						return;
					}
					try {
						const response = JSON.parse(xhr.responseText);
						if (xhr.status >= 200 && xhr.status < 300) {
							resolve(response);
						} else {
							reject({ status: xhr.status, response });
						}
					} catch (e) {
						reject({ status: xhr.status, response: xhr.responseText });
					}
				};
				xhr.onerror = () =>
					reject({ status: xhr.status, statusText: xhr.statusText });
				xhr.send(body ? JSON.stringify(body) : null);
			});
		},
		configure(creds) {
			this.bearerToken = creds.bearer;
			this.mediaUserToken = creds.mediaUser;
		},
		getPlaylist(playlistUrl, credentials) {
			const helpers = {
				createTrackObject: createTrackObject.toString(),
				_xhrRequest: this._xhrRequest.toString(),
			};

			const mainLogic = async function () {
				const config = __CONFIG_PLACEHOLDER__;
				const { playlistUrl, bearer, mediaUser } = config;
				__HELPERS_PLACEHOLDER__;

				console.log("--- Apple Music Fetcher Initialized ---");

				const showModal = (content) => {
					let modal = document.getElementById("porter-modal");
					if (!modal) {
						modal = document.createElement("div");
						modal.id = "porter-modal";
						modal.style.position = "fixed";
						modal.style.left = "50%";
						modal.style.top = "50%";
						modal.style.transform = "translate(-50%, -50%)";
						modal.style.padding = "20px 40px";
						modal.style.backgroundColor = "#222";
						modal.style.color = "#fff";
						modal.style.border = "1px solid #444";
						modal.style.borderRadius = "10px";
						modal.style.zIndex = "999999";
						modal.style.textAlign = "center";
						modal.style.boxShadow = "0 10px 30px rgba(0,0,0,0.5)";
						document.body.appendChild(modal);
					}
					modal.innerHTML = content;
				};

				try {
					showModal(
						`<h3 style="color:#fff;">Fetching Playlist...</h3><p>This may take a moment for large playlists.</p>`
					);

					const urlPath = new URL(playlistUrl).pathname;
					const pathParts = urlPath.split("/").filter((p) => p);
					const isLibraryPlaylist = pathParts.includes("library");
					const playlistId = pathParts[pathParts.length - 1];
					const storefront =
						pathParts.find((p) => p.length === 2 && p !== "u") || "us";
					const ampHeaders = {
						Authorization: bearer,
						"media-user-token": mediaUser,
					};

					let allTracksData = [];
					let playlistName = "Fetched Apple Music Playlist";
					let nextUrl = null;

					if (isLibraryPlaylist) {
						// Library playlists have a simpler pagination structure
						nextUrl = `https://amp-api.music.apple.com/v1/me/library/playlists/${playlistId}/tracks?include=catalog`;
					} else {
						// Catalog playlists require a separate call for metadata first
						const metadataUrl = `https://amp-api.music.apple.com/v1/catalog/${storefront}/playlists/${playlistId}`;
						const metadataResponse = await _xhrRequest(
							"GET",
							metadataUrl,
							ampHeaders
						);
						playlistName = metadataResponse.data[0].attributes.name;
						// THIS IS THE CRITICAL FIX: The initial request MUST be to the /tracks endpoint
						nextUrl = `https://amp-api.music.apple.com/v1/catalog/${storefront}/playlists/${playlistId}/tracks`;
					}

					let page = 1;
					while (nextUrl) {
						console.log(`Fetching page ${page}...`);
						showModal(
							`<h3 style="color:#fff;">Fetching Playlist...</h3><p>Page ${page}... (${allTracksData.length} tracks found)</p>`
						);

						const response = await _xhrRequest("GET", nextUrl, ampHeaders);
						const tracksOnPage = response.data || [];

						if (Array.isArray(tracksOnPage) && tracksOnPage.length > 0) {
							allTracksData.push(...tracksOnPage);
						}

						nextUrl = response.next
							? `https://amp-api.music.apple.com${response.next}`
							: null;
						page++;
					}

					if (allTracksData.length === 0) {
						throw new Error(
							"The playlist appears to be empty or data could not be parsed."
						);
					}

					const tracks = allTracksData.map((track) =>
						createTrackObject(
							track.attributes.name,
							track.attributes.artistName,
							track.attributes.albumName,
							track.attributes.durationInMillis
						)
					);
					const finalData = { name: playlistName, tracks };
					const finalJSON = JSON.stringify(finalData, null, 2);

					const modalContent = `
						<h3 style="margin-top:0; color:#fff;">Playlist Data Fetched!</h3>
						<p>${tracks.length} tracks found. Click to copy.</p>
						<button id="porter-copy-btn" style="background-color:#007aff; color:white; border:none; padding:10px 20px; border-radius:5px; cursor:pointer; font-size:16px;">Copy Data & Return to App</button>
						<p style="font-size:12px; margin-top:15px; color:#888;">You can now close this tab.</p>`;
					showModal(modalContent);

					document.getElementById("porter-copy-btn").onclick = function () {
						navigator.clipboard.writeText(finalJSON);
						this.textContent = "Copied!";
						this.style.backgroundColor = "#34c759";
					};
				} catch (error) {
					console.error("Failed to fetch Apple Music playlist:", error);
					const errorMsg = error.status
						? `Error ${error.status}: ${
								error.response?.errors?.[0]?.title ||
								"Please check tokens and URL."
						  }`
						: error.message;
					showModal(
						`<h3 style="color: #ff3b30;">Error!</h3><p>${errorMsg}</p><p style="font-size:12px; color:#888;">(Ensure you are logged in and the tokens/URL are correct)</p>`
					);
				}
			}.toString();

			const config = { playlistUrl, ...credentials };
			let script = `( ${mainLogic} )();`;
			script = script.replace("__CONFIG_PLACEHOLDER__", JSON.stringify(config));
			const helpersString = `const createTrackObject = ${helpers.createTrackObject};\nconst _xhrRequest = ${helpers._xhrRequest};`;
			script = script.replace("__HELPERS_PLACEHOLDER__", helpersString);

			return script;
		},

		createPlaylist(playlistName, tracks) {
			const config = {
				bearer: this.bearerToken,
				mediaUser: this.mediaUserToken,
				playlistName,
				tracks,
			};
			return this.generateConsoleCode(config);
		},

		generateConsoleCode(config) {
			const { bearer, mediaUser, playlistName, tracks } = config;

			const helpers = {
				_xhrRequest: this._xhrRequest.toString(),
				_cleanString: _cleanString.toString(),
			};
			const mainLogic = async function () {
				const config = __CONFIG_PLACEHOLDER__;
				__HELPERS_PLACEHOLDER__;

				const ApiManager = {
					pool: [
						"https://amp-api.music.apple.com",
						"https://amp-api-edge.music.apple.com",
					],
					currentIndex: 0,
					maxDelay: 60000,
					currentDelay: 0,

					getCurrentEndpoint() {
						return this.pool[this.currentIndex];
					},

					switchToNextEndpoint() {
						this.currentIndex = (this.currentIndex + 1) % this.pool.length;
						console.warn(
							`%cSwitching to fallback API endpoint: ${this.getCurrentEndpoint()}`,
							"color: #ff9800;"
						);
					},

					async sleep(ms) {
						return new Promise((resolve) => setTimeout(resolve, ms));
					},

					handleRateLimit() {
						console.error(
							`RATE LIMITED on ${this.getCurrentEndpoint()}. Backing off...`
						);
						this.switchToNextEndpoint();
						if (this.currentDelay === 0) {
							this.currentDelay = 2000;
						} else {
							this.currentDelay = Math.min(
								this.maxDelay,
								this.currentDelay * 2
							);
						}

						console.warn(
							`New delay on retry will be ${Math.round(
								this.currentDelay / 1000
							)}s.`
						);
						if (this.currentDelay > 30000) {
							console.warn(
								"%cThe API is heavily throttling requests. This may take a very long time. Consider stopping (refresh the page) and trying again in an hour.",
								"font-weight: bold; color: #ffc107;"
							);
						}
					},

					handleSuccess() {
						if (this.currentDelay > 0) {
							this.currentDelay = Math.max(0, this.currentDelay - 500);
						}
					},
				};

				const _rateLimitedRequest = async (method, path, headers, body) => {
					while (true) {
						try {
							if (ApiManager.currentDelay > 0) {
								await ApiManager.sleep(ApiManager.currentDelay);
							}
							const fullUrl = ApiManager.getCurrentEndpoint() + path;
							const result = await _xhrRequest(method, fullUrl, headers, body);
							ApiManager.handleSuccess();
							return result;
						} catch (e) {
							if (e.status === 429) {
								ApiManager.handleRateLimit();
								continue;
							} else {
								console.error(`Unrecoverable error on ${path}:`, e);
								throw e;
							}
						}
					}
				};

				console.log(
					"%c--- Apple Music Transfer Initialized ---",
					"color: #4A80F5; font-size: 1.2em; font-weight: bold;"
				);

				let storefrontId = "us";
				try {
					storefrontId = MusicKit.getInstance().storefrontId;
					console.log(`Successfully detected storefront: ${storefrontId}`);
				} catch (e) {
					console.warn("Could not detect storefront, falling back to 'us'.");
				}

				const { bearer, mediaUser, playlistName, tracks } = config;
				const ampHeaders = {
					Authorization: bearer,
					"media-user-token": mediaUser,
					"Content-Type": "application/json",
				};

				let playlistId = null;
				try {
					console.log("Checking for existing playlist...");
					const existingPlaylists = await _rateLimitedRequest(
						"GET",
						"/v1/me/library/playlists",
						ampHeaders
					);
					const existing = existingPlaylists.data.find(
						(p) => p.attributes.name === playlistName
					);
					if (existing) {
						console.log(`Playlist "${playlistName}" already exists.`);
						playlistId = existing.id;
					}
				} catch (e) {
					console.error("Could not check for existing playlists.", e);
				}

				if (!playlistId) {
					console.log(`Creating new playlist: "${playlistName}"`);
					try {
						const newPlaylistData = await _rateLimitedRequest(
							"POST",
							"/v1/me/library/playlists",
							ampHeaders,
							{
								attributes: {
									name: playlistName,
									description: `Transferred by https://r-besson.github.io/playlist-transfer/`,
								},
							}
						);
						playlistId = newPlaylistData.data[0].id;
					} catch (e) {
						console.error(
							`FATAL: Failed to create playlist. Aborting.`,
							e.response || e
						);
						return;
					}
				}

				console.log(
					`%c--- Phase 1 of 2: Searching for ${tracks.length} tracks... ---`,
					"color: #03a9f4; font-weight: bold;"
				);
				const allSearchResults = [];
				const BATCH_SIZE = 10;
				for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
					const batch = tracks.slice(i, i + BATCH_SIZE);
					const promises = batch.map(async (track, j) => {
						const index = i + j;
						console.log(
							`[${index + 1}/${tracks.length}] Searching for: ${
								track.title
							} - ${track.artist}`
						);
						const searchTerm = `${_cleanString(track.artist)} ${_cleanString(
							track.title
						)}`;
						const searchPath = `/v1/catalog/${storefrontId}/search?term=${encodeURIComponent(
							searchTerm
						)}&types=songs&limit=5`;
						try {
							const res = await _rateLimitedRequest(
								"GET",
								searchPath,
								ampHeaders
							);
							if (res?.results?.songs?.data.length > 0) {
								const bestMatch = res.results.songs.data[0];
								console.log(
									`  ✔ Found: ${bestMatch.attributes.name} - ${bestMatch.attributes.artistName}`
								);
								return { index, songId: bestMatch.id };
							}
						} catch (e) {
							/* Error is logged by request function */
						}
						console.warn(`  ✖ No matches found for: ${track.title}`);
						return { index, songId: null, originalTrack: track };
					});
					allSearchResults.push(...(await Promise.all(promises)));
				}

				const foundTracks = allSearchResults
					.filter((r) => r.songId)
					.sort((a, b) => a.index - b.index);
				const notFoundTracks = allSearchResults
					.filter((r) => !r.songId)
					.map((r) => r.originalTrack);

				console.log(
					`%c--- Phase 2 of 2: Adding ${foundTracks.length} found tracks to playlist... ---`,
					"color: #03a9f4; font-weight: bold;"
				);
				const ADD_BATCH_SIZE = 100;
				for (let i = 0; i < foundTracks.length; i += ADD_BATCH_SIZE) {
					const batch = foundTracks.slice(i, i + ADD_BATCH_SIZE);
					const trackIdsToAdd = batch.map((t) => ({
						id: t.songId,
						type: "songs",
					}));
					console.log(
						`Adding batch ${i / ADD_BATCH_SIZE + 1}... (${batch.length} tracks)`
					);
					try {
						await _rateLimitedRequest(
							"POST",
							`/v1/me/library/playlists/${playlistId}/tracks`,
							ampHeaders,
							{ data: trackIdsToAdd }
						);
					} catch (e) {
						console.error(
							`FATAL: Failed to add a batch of tracks. Some tracks may be missing.`,
							e.response || e
						);
					}
				}

				console.log(
					"%c--- Transfer Complete! ---",
					"color: #4A80F5; font-size: 1.2em; font-weight: bold;"
				);
				console.log(
					`%cSuccessfully added: ${foundTracks.length}`,
					"color: green"
				);
				if (notFoundTracks.length > 0) {
					console.warn(
						`%cCould not find: ${notFoundTracks.length}`,
						"color: #ffc107"
					);
					console.table(
						notFoundTracks.map((t) => ({ title: t.title, artist: t.artist }))
					);
				}
				console.log(
					`View your ordered playlist here: https://music.apple.com/library/playlist/${playlistId}`
				);
			}.toString();

			let script = `( ${mainLogic} )();`;
			script = script.replace(
				"__CONFIG_PLACEHOLDER__",
				JSON.stringify(config, null, 2)
			);
			const helpersString = `const _xhrRequest = ${helpers._xhrRequest};\nconst _cleanString = ${helpers._cleanString};`;
			script = script.replace("__HELPERS_PLACEHOLDER__", helpersString);
			return script;
		},
	},

	text: {
		getPlaylist(textSource) {
			const lines = textSource
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line);
			const tracks = lines.map((line) => {
				const separators = [" - ", " – ", " -- ", " by "];
				let artist = "";
				let title = line;

				for (const sep of separators) {
					if (line.includes(sep)) {
						const parts = line.split(sep);
						artist = parts[0].trim();
						title = parts.slice(1).join(sep).trim();
						break;
					}
				}
				return createTrackObject(title, artist);
			});
			return Promise.resolve({ name: "Playlist from Text", tracks });
		},
		createPlaylist(playlistName, tracks, logFn) {
			logFn(`--- Generating Text Output for "${playlistName}" ---`, "info");
			const output = tracks
				.map((track) => `${track.artist} - ${track.title}`)
				.join("\n");
			logFn(
				`Successfully generated list with ${tracks.length} tracks.`,
				"success"
			);
			return Promise.resolve(output);
		},
	},
};
