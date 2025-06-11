document.addEventListener('DOMContentLoaded', () => {
    // Application State
    const appState = {
        source: { service: null, url: null, data: null, credentials: {} },
        destination: { service: null, credentials: {}, playlistName: '', fastTransfer: false }
    };

    // --- DOM Elements ---
    const allViews = document.querySelectorAll('.view');
    const homeLink = document.getElementById('home-link');
    const sourceServiceEl = document.getElementById('source-service');
    const sourceUrlEl = document.getElementById('source-url');
    const btnSourceNext = document.getElementById('btn-source-next');
    const destCards = document.querySelectorAll('.card');
    const btnDestBack = document.getElementById('btn-dest-back');
    const sourceCredsSection = document.getElementById('source-creds-section');
    const sourceCredsTitle = document.getElementById('source-creds-title');
    const sourceInstructionsContainer = document.getElementById('source-instructions-container');
    const sourceCredsForm = document.getElementById('source-creds-form');
    const destinationCredsTitle = document.getElementById('destination-creds-title');
    const fastTransferContainer = document.getElementById('fast-transfer-container');
    const fastTransferCheckbox = document.getElementById('fast-transfer-checkbox');
    const newPlaylistNameInput = document.getElementById('new-playlist-name');
    const destinationInstructionsContainer = document.getElementById('destination-instructions-container');
    const destinationCredsForm = document.getElementById('destination-creds-form');
    const btnLogin = document.getElementById('btn-login-and-transfer');
    const btnCredsBack = document.getElementById('btn-creds-back');
    const progressTitle = document.getElementById('progress-title');
    const progressText = document.getElementById('progress-text');
    const trackLog = document.getElementById('track-log');
    const btnStartOver = document.getElementById('btn-start-over');
    const btnContinueToYouTube = document.getElementById('btn-continue-to-youtube-auth');
    const themeSwitch = document.getElementById('theme-checkbox');
    const loader = document.querySelector('.loader');

    // --- App Reset & Navigation ---
    const showView = (viewId) => {
        allViews.forEach(view => view.classList.remove('visible'));
        const viewToShow = document.getElementById(viewId);
        if (viewToShow) setTimeout(() => viewToShow.classList.add('visible'), 50);
    };

    const resetApp = () => {
        appState.source = { service: null, url: null, data: null, credentials: {} };
        appState.destination = { service: null, credentials: {}, playlistName: '', fastTransfer: false };
        sourceUrlEl.value = '';
        newPlaylistNameInput.value = '';
        fastTransferCheckbox.checked = false;
        localStorage.removeItem('appState');
        showView('view-source-select');
        sourceUrlEl.focus();
        btnStartOver.style.display = 'none';
        loader.style.display = 'block';
    };

    homeLink.addEventListener('click', resetApp);
    btnStartOver.addEventListener('click', resetApp);
    themeSwitch.addEventListener('change', () => {
        document.documentElement.setAttribute('data-theme', themeSwitch.checked ? 'dark' : 'light');
        localStorage.setItem('theme', themeSwitch.checked ? 'dark' : 'light');
    });

    // --- Main App Flow ---
    btnSourceNext.addEventListener('click', () => {
        if (!sourceUrlEl.value) { alert('Please enter a playlist URL.'); return; }
        appState.source.service = sourceServiceEl.value;
        appState.source.url = sourceUrlEl.value;
        destCards.forEach(card => card.style.display = card.dataset.service !== appState.source.service ? 'block' : 'none');
        showView('view-destination-select');
    });

    destCards.forEach(card => {
        card.addEventListener('click', () => {
            appState.destination.service = card.dataset.service;
            setupCredentialsView();
            showView('view-destination-setup');
        });
    });

    btnDestBack.addEventListener('click', () => showView('view-source-select'));
    btnCredsBack.addEventListener('click', () => showView('view-destination-select'));

    const setupCredentialsView = () => {
        const { source, destination } = appState;
        [sourceInstructionsContainer, sourceCredsForm, destinationInstructionsContainer, destinationCredsForm].forEach(el => el.innerHTML = '');
        sourceCredsSection.style.display = 'block';
        fastTransferContainer.style.display = 'none';
        const getTemplate = (id) => document.getElementById(id).innerHTML;

        const sourceName = source.service.charAt(0).toUpperCase() + source.service.slice(1);
        sourceCredsTitle.textContent = `Source: ${sourceName}`;
        if (source.service === 'youtube') {
            sourceInstructionsContainer.innerHTML = getTemplate('instructions-youtube-source-template');
            sourceCredsForm.innerHTML = `<label for="source-youtube-api-key">API Key</label><input type="text" id="source-youtube-api-key" placeholder="YouTube API Key">`;
        } else if (source.service === 'spotify') {
            sourceInstructionsContainer.innerHTML = getTemplate('instructions-spotify-source-template');
            sourceCredsForm.innerHTML = `<label for="source-spotify-client-id">Client ID</label><input type="text" id="source-spotify-client-id" placeholder="Spotify Client ID">`;
        }
        
        const destName = destination.service.charAt(0).toUpperCase() + destination.service.slice(1);
        destinationCredsTitle.textContent = `Destination: ${destName}`;
        newPlaylistNameInput.value = `My Transferred Playlist`;
        if (destination.service === 'spotify') {
            destinationInstructionsContainer.innerHTML = (source.service === 'spotify') ? '' : getTemplate('instructions-spotify-source-template');
            destinationCredsForm.innerHTML = (source.service === 'spotify') ? `<p class="field-note">The Spotify login will be used for both source and destination.</p>` : '';
            destinationCredsForm.innerHTML += `<label for="dest-spotify-client-id">Client ID</label><input type="text" id="dest-spotify-client-id" placeholder="Spotify Client ID">`;
        } else if (destination.service === 'youtube') {
            fastTransferContainer.style.display = 'flex';
            destinationInstructionsContainer.innerHTML = getTemplate('instructions-youtube-destination-template');
            destinationCredsForm.innerHTML = `<label for="dest-youtube-api-key">API Key</label><input type="text" id="dest-youtube-api-key" placeholder="YouTube API Key">
                                            <label for="dest-youtube-client-id">Client ID</label><input type="text" id="dest-youtube-client-id" placeholder="YouTube OAuth Client ID">`;
        } else if (destination.service === 'applemusic') {
            destinationInstructionsContainer.innerHTML = getTemplate('instructions-applemusic-destination-template');
            destinationCredsForm.innerHTML = `<label for="dest-apple-bearer">Bearer Token</label><input type="password" id="dest-apple-bearer" placeholder="Starts with 'Bearer ey...'">
                                              <label for="dest-apple-media-user">Media User Token</label><input type="password" id="dest-apple-media-user" placeholder="Your Media User Token">
                                              <label for="dest-apple-country">2-Letter Country Code</label><input type="text" id="dest-apple-country" placeholder="e.g., US, GB, DE" maxlength="2">`;
        }
    };

    btnLogin.addEventListener('click', () => {
        const { source, destination } = appState;
        try {
            if (document.getElementById('source-spotify-client-id')) source.credentials.clientId = document.getElementById('source-spotify-client-id').value;
            if (document.getElementById('source-youtube-api-key')) source.credentials.apiKey = document.getElementById('source-youtube-api-key').value;
            if (document.getElementById('dest-spotify-client-id')) destination.credentials.clientId = document.getElementById('dest-spotify-client-id').value;
            if (document.getElementById('dest-youtube-client-id')) {
                destination.credentials.apiKey = document.getElementById('dest-youtube-api-key').value;
                destination.credentials.clientId = document.getElementById('dest-youtube-client-id').value;
            }
            if (document.getElementById('dest-apple-bearer')) {
                destination.credentials.bearer = document.getElementById('dest-apple-bearer').value;
                destination.credentials.mediaUser = document.getElementById('dest-apple-media-user').value;
                destination.credentials.countryCode = document.getElementById('dest-apple-country').value;
            }
            destination.playlistName = newPlaylistNameInput.value;
            destination.fastTransfer = fastTransferCheckbox.checked;
        } catch (e) {}

        const spotifySourceClientId = source.service === 'spotify' ? (source.credentials.clientId || destination.credentials.clientId) : null;
        const isInvalid = !destination.playlistName ||
            (destination.service === 'spotify' && !destination.credentials.clientId) ||
            (destination.service === 'youtube' && (!destination.credentials.apiKey || !destination.credentials.clientId)) ||
            (destination.service === 'applemusic' && (!destination.credentials.bearer || !destination.credentials.mediaUser || !destination.credentials.countryCode)) ||
            (source.service === 'spotify' && !spotifySourceClientId) ||
            (source.service === 'youtube' && !source.credentials.apiKey);

        if (isInvalid) { alert('Please fill in all required credential and name fields.'); return; }
        localStorage.setItem('appState', JSON.stringify(appState));
        startAuthenticationFlow();
    });
    
    btnContinueToYouTube.addEventListener('click', async () => {
        btnContinueToYouTube.style.display = 'none';
        loader.style.display = 'block';
        try {
            progressText.textContent = `Authenticating with YouTube...`;
            await API.youtube.configure(appState.destination.credentials.apiKey);
            await API.youtube.authenticate(appState.destination.credentials.clientId);
            await runFullTransferProcess();
        } catch (error) { handleError(error); }
    });

    const logMessage = (message, type) => {
        const li = document.createElement('li');
        li.className = type; li.textContent = message; trackLog.appendChild(li); li.scrollIntoView();
    };

    const startAuthenticationFlow = async () => {
        showView('view-progress');
        trackLog.innerHTML = '';
        try {
            const { source, destination } = appState;
            const spotifyClientId = source.credentials.clientId || destination.credentials.clientId;
            if (spotifyClientId && !API.spotify.accessToken) {
                progressText.textContent = `Authenticating with Spotify...`;
                await API.spotify.authenticate(spotifyClientId);
            } else if (destination.service === 'youtube') {
                progressText.textContent = `Authenticating with YouTube...`;
                await API.youtube.configure(destination.credentials.apiKey);
                await API.youtube.authenticate(destination.credentials.clientId);
                await runFullTransferProcess();
            } else {
                 await runFullTransferProcess();
            }
        } catch (error) { handleError(error); }
    };
    
    const runFullTransferProcess = async () => {
        try {
            progressText.textContent = `Configuring source: ${appState.source.service}...`;
            if (appState.source.service === 'youtube') {
                await API.youtube.configure(appState.source.credentials.apiKey);
            } else if (appState.source.service === 'spotify') {
                if (!API.spotify.accessToken) throw new Error("Could not get Spotify token.");
            }
            
            progressText.textContent = `Fetching tracks from ${appState.source.service}...`;
            const sourceData = await API[appState.source.service].getPlaylist(appState.source.url);
            logMessage(`Found playlist "${sourceData.name}" with ${sourceData.tracks.length} tracks.`, 'info');

            const destApi = API[appState.destination.service];
            if (appState.destination.service === 'applemusic') {
                destApi.configure(appState.destination.credentials);
            }

            const newPlaylistName = appState.destination.playlistName;
            progressText.textContent = `Creating playlist "${newPlaylistName}"...`;
            const newPlaylistUrl = await destApi.createPlaylist(newPlaylistName, sourceData.tracks, logMessage, appState.destination.fastTransfer);

            progressTitle.textContent = 'Transfer Complete!';
            progressText.innerHTML = `Success! Your new playlist is ready.<br><a href="${newPlaylistUrl}" target="_blank">Open Playlist</a>`;
            loader.style.display = 'none';
            btnStartOver.style.display = 'inline-block';
        } catch (error) {
            if (error.message === 'YOUTUBE_QUOTA_EXCEEDED') {
                handleError({ message: 'YouTube API daily quota exceeded. Halting transfer. Please try again tomorrow.' });
            } else { handleError(error); }
        } finally {
            localStorage.removeItem('appState');
        }
    };
    
    const handleError = (error) => {
        console.error('Transfer Error:', error);
        progressTitle.textContent = 'Transfer Failed';
        let finalErrorMessage = `Error: ${error.message}`;
        if (error && error.result && error.result.error && Array.isArray(error.result.error.errors)) {
            const detailedError = error.result.error.errors[0];
            if (detailedError && detailedError.reason === 'quotaExceeded') {
                finalErrorMessage = 'Error: YouTube API daily quota exceeded. This is a limit set by Google. Please try again tomorrow.';
            }
        }
        progressText.textContent = finalErrorMessage;
        loader.style.display = 'none';
        btnStartOver.style.display = 'inline-block';
        localStorage.removeItem('appState');
    };

    const initialize = async () => {
        const currentTheme = localStorage.getItem('theme');
        if (currentTheme) {
            document.documentElement.setAttribute('data-theme', currentTheme);
            themeSwitch.checked = (currentTheme === 'dark');
        }
        const savedStateJSON = localStorage.getItem('appState');
        if (!savedStateJSON) return;
        const savedState = JSON.parse(savedStateJSON);
        const spotifyClientId = savedState.source.credentials.clientId || savedState.destination.credentials.clientId;
        if (spotifyClientId) {
            try {
                API.spotify.clientId = spotifyClientId;
                if (await API.spotify.handleAuthRedirect()) {
                    Object.assign(appState, savedState);
                    showView('view-progress');
                    if (appState.destination.service === 'spotify') {
                        await runFullTransferProcess();
                    } else if (appState.destination.service === 'youtube') {
                        progressText.textContent = `Spotify authenticated. Click below to sign in to YouTube.`;
                        loader.style.display = 'none';
                        btnContinueToYouTube.style.display = 'inline-block';
                    } else if (appState.destination.service === 'applemusic') {
                        await runFullTransferProcess();
                    }
                }
            } catch (error) { handleError(error); }
        }
    };

    initialize();
});