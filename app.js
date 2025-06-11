document.addEventListener("DOMContentLoaded", () => {
	// Application State
	const appState = {
		source: { service: null, url: null, data: null, credentials: {} },
		destination: {
			service: null,
			credentials: {},
			playlistName: "",
			fastTransfer: false,
		},
	};

	// --- DOM Elements ---
	const allViews = document.querySelectorAll(".view");
	const homeLink = document.getElementById("home-link");
	const sourceServiceEl = document.getElementById("source-service");
	const sourceUrlEl = document.getElementById("source-url");
	const sourceUrlContainer = document.getElementById("source-url-container");
	const sourceTextEl = document.getElementById("source-text");
	const sourceTextContainer = document.getElementById("source-text-container");
	const btnSourceNext = document.getElementById("btn-source-next");
	const destCards = document.querySelectorAll(".card");
	const btnDestBack = document.getElementById("btn-dest-back");
	const sourceCredsSection = document.getElementById("source-creds-section");
	const sourceCredsTitle = document.getElementById("source-creds-title");
	const sourceInstructionsContainer = document.getElementById(
		"source-instructions-container"
	);
	const sourceCredsForm = document.getElementById("source-creds-form");
	const destinationCredsTitle = document.getElementById(
		"destination-creds-title"
	);
	const fastTransferContainer = document.getElementById(
		"fast-transfer-container"
	);
	const fastTransferCheckbox = document.getElementById(
		"fast-transfer-checkbox"
	);
	const newPlaylistNameInput = document.getElementById("new-playlist-name");
	const newPlaylistNameContainer = newPlaylistNameInput.parentElement;
	const destinationInstructionsContainer = document.getElementById(
		"destination-instructions-container"
	);
	const destinationCredsForm = document.getElementById(
		"destination-creds-form"
	);
	const btnLogin = document.getElementById("btn-login-and-transfer");
	const btnCredsBack = document.getElementById("btn-creds-back");
	const progressTitle = document.getElementById("progress-title");
	const progressText = document.getElementById("progress-text");
	const trackLog = document.getElementById("track-log");
	const btnStartOver = document.getElementById("btn-start-over");
	const btnContinueToYouTube = document.getElementById(
		"btn-continue-to-youtube-auth"
	);
	const themeSwitch = document.getElementById("theme-checkbox");
	const loader = document.querySelector(".loader");
	const amFetchCodeContainer = document.getElementById(
		"am-fetch-code-container"
	);
	const amFetchCodeEl = document.getElementById("am-fetch-code");
	const amPasteDataEl = document.getElementById("am-paste-data");
	const btnAmFetchContinue = document.getElementById("btn-am-fetch-continue");
	const btnAmFetchBack = document.getElementById("btn-am-fetch-back");

	// --- App Reset & Navigation ---
	const showView = (viewId) => {
		allViews.forEach((view) => view.classList.remove("visible"));
		const viewToShow = document.getElementById(viewId);
		if (viewToShow) setTimeout(() => viewToShow.classList.add("visible"), 50);
	};

	const resetApp = () => {
		appState.source = { service: null, url: null, data: null, credentials: {} };
		appState.destination = {
			service: null,
			credentials: {},
			playlistName: "",
			fastTransfer: false,
		};
		sourceUrlEl.value = "";
		sourceTextEl.value = "";
		newPlaylistNameInput.value = "";
		amPasteDataEl.value = "";
		fastTransferCheckbox.checked = false;
		sourceServiceEl.value = "spotify";
		sourceUrlContainer.style.display = "block";
		sourceTextContainer.style.display = "none";
		localStorage.removeItem("appState");
		showView("view-source-select");
		sourceUrlEl.focus();
		btnStartOver.style.display = "none";
		loader.style.display = "block";
	};

	homeLink.addEventListener("click", resetApp);
	btnStartOver.addEventListener("click", resetApp);
	themeSwitch.addEventListener("change", () => {
		document.documentElement.setAttribute(
			"data-theme",
			themeSwitch.checked ? "dark" : "light"
		);
		localStorage.setItem("theme", themeSwitch.checked ? "dark" : "light");
	});

	// --- Main App Flow ---

	sourceServiceEl.addEventListener("change", (e) => {
		const isText = e.target.value === "text";
		sourceUrlContainer.style.display = isText ? "none" : "block";
		sourceTextContainer.style.display = isText ? "block" : "none";
	});

	btnSourceNext.addEventListener("click", () => {
		const service = sourceServiceEl.value;
		appState.source.service = service;

		if (service === "text") {
			const textContent = sourceTextEl.value;
			if (!textContent) {
				alert("Please paste your song list.");
				return;
			}
			appState.source.url = textContent; // Use 'url' field to store text
		} else {
			if (!sourceUrlEl.value) {
				alert("Please enter a playlist URL.");
				return;
			}
			appState.source.url = sourceUrlEl.value;
		}

		destCards.forEach(
			(card) =>
				(card.style.display =
					card.dataset.service !== appState.source.service ? "block" : "none")
		);
		showView("view-destination-select");
	});

	btnAmFetchBack.addEventListener("click", () =>
		showView("view-destination-setup")
	);

	btnAmFetchContinue.addEventListener("click", () => {
		const pastedData = amPasteDataEl.value;
		if (!pastedData) {
			alert("Please paste the data from Apple Music first.");
			return;
		}
		try {
			const parsedData = JSON.parse(pastedData);
			if (!parsedData.name || !Array.isArray(parsedData.tracks)) {
				throw new Error("Invalid data format.");
			}
			appState.source.data = parsedData;
			localStorage.setItem("appState", JSON.stringify(appState));
			startAuthenticationFlow();
		} catch (e) {
			alert(
				"Invalid data pasted. Please re-copy the data from Apple Music and try again."
			);
			console.error("Error parsing pasted Apple Music data:", e);
		}
	});

	destCards.forEach((card) => {
		card.addEventListener("click", () => {
			appState.destination.service = card.dataset.service;
			setupCredentialsView();
			showView("view-destination-setup");
		});
	});

	btnDestBack.addEventListener("click", () => showView("view-source-select"));
	btnCredsBack.addEventListener("click", () =>
		showView("view-destination-select")
	);

	const setupCredentialsView = () => {
		const { source, destination } = appState;
		[
			sourceInstructionsContainer,
			sourceCredsForm,
			destinationInstructionsContainer,
			destinationCredsForm,
		].forEach((el) => (el.innerHTML = ""));

		sourceCredsSection.style.display = "block";
		fastTransferContainer.style.display = "none";
		const getTemplate = (id) => document.getElementById(id).innerHTML;

		// --- Source Setup ---
		if (source.service === "text") {
			sourceCredsSection.style.display = "none";
		} else {
			sourceCredsSection.style.display = "block";
			const sourceName =
				source.service.charAt(0).toUpperCase() + source.service.slice(1);
			sourceCredsTitle.textContent = `Source: ${sourceName}`;

			if (source.service === "youtube") {
				sourceInstructionsContainer.innerHTML = getTemplate(
					"instructions-youtube-source-template"
				);
				sourceCredsForm.innerHTML = `<label for="source-youtube-api-key">API Key</label><input type="text" id="source-youtube-api-key" placeholder="YouTube API Key">`;
			} else if (source.service === "spotify") {
				sourceInstructionsContainer.innerHTML = getTemplate(
					"instructions-spotify-source-template"
				);
				sourceCredsForm.innerHTML = `<label for="source-spotify-client-id">Client ID</label><input type="text" id="source-spotify-client-id" placeholder="Spotify Client ID">`;
			} else if (source.service === "applemusic") {
				sourceInstructionsContainer.innerHTML = getTemplate(
					"instructions-applemusic-destination-template"
				);
				sourceCredsForm.innerHTML = `<label for="source-apple-bearer">Bearer Token</label><input type="password" id="source-apple-bearer" placeholder="Starts with 'Bearer ...'">
                                        <label for="source-apple-media-user">Media User Token</label><input type="password" id="source-apple-media-user" placeholder="Your Media User Token">`;
			}
		}

		// --- Destination Setup ---
		const destName =
			destination.service.charAt(0).toUpperCase() +
			destination.service.slice(1);
		destinationCredsTitle.textContent = `Destination: ${destName}`;

		if (destination.service === "text") {
			newPlaylistNameContainer.style.display = "none";
		} else {
			newPlaylistNameContainer.style.display = "block";
			newPlaylistNameInput.value = `My Transferred Playlist`;

			if (destination.service === "spotify") {
				destinationInstructionsContainer.innerHTML =
					source.service === "spotify"
						? ""
						: getTemplate("instructions-spotify-source-template");
				destinationCredsForm.innerHTML =
					source.service === "spotify"
						? `<p class="field-note">The Spotify login will be used for both source and destination.</p>`
						: "";
				destinationCredsForm.innerHTML += `<label for="dest-spotify-client-id">Client ID</label><input type="text" id="dest-spotify-client-id" placeholder="Spotify Client ID">`;
			} else if (destination.service === "youtube") {
				fastTransferContainer.style.display = "flex";
				destinationInstructionsContainer.innerHTML = getTemplate(
					"instructions-youtube-destination-template"
				);
				destinationCredsForm.innerHTML = `<label for="dest-youtube-api-key">API Key</label><input type="text" id="dest-youtube-api-key" placeholder="YouTube API Key">
                                            <label for="dest-youtube-client-id">Client ID</label><input type="text" id="dest-youtube-client-id" placeholder="YouTube OAuth Client ID">`;
			} else if (destination.service === "applemusic") {
				destinationInstructionsContainer.innerHTML = getTemplate(
					"instructions-applemusic-destination-template"
				);
				destinationCredsForm.innerHTML = `<label for="dest-apple-bearer">Bearer Token</label><input type="password" id="dest-apple-bearer" placeholder="Starts with 'Bearer ...'">
                                              <label for="dest-apple-media-user">Media User Token</label><input type="password" id="dest-apple-media-user" placeholder="Your Media User Token">`;
			}
		}
	};

	btnLogin.addEventListener("click", () => {
		const { source, destination } = appState;
		try {
			if (source.service !== "text") {
				if (document.getElementById("source-spotify-client-id"))
					source.credentials.clientId = document.getElementById(
						"source-spotify-client-id"
					).value;
				if (document.getElementById("source-youtube-api-key"))
					source.credentials.apiKey = document.getElementById(
						"source-youtube-api-key"
					).value;
				if (document.getElementById("source-apple-bearer")) {
					source.credentials.bearer = document.getElementById(
						"source-apple-bearer"
					).value;
					source.credentials.mediaUser = document.getElementById(
						"source-apple-media-user"
					).value;
				}
			}

			if (destination.service !== "text") {
				if (document.getElementById("dest-spotify-client-id"))
					destination.credentials.clientId = document.getElementById(
						"dest-spotify-client-id"
					).value;
				if (document.getElementById("dest-youtube-client-id")) {
					destination.credentials.apiKey = document.getElementById(
						"dest-youtube-api-key"
					).value;
					destination.credentials.clientId = document.getElementById(
						"dest-youtube-client-id"
					).value;
				}
				if (document.getElementById("dest-apple-bearer")) {
					destination.credentials.bearer =
						document.getElementById("dest-apple-bearer").value;
					destination.credentials.mediaUser = document.getElementById(
						"dest-apple-media-user"
					).value;
				}
				destination.playlistName = newPlaylistNameInput.value;
			}
			destination.fastTransfer = fastTransferCheckbox.checked;
		} catch (e) {}

		const isInvalid =
			// Playlist name is required only if destination is NOT text
			(destination.service !== "text" && !destination.playlistName) ||
			// Destination credentials (not for text)
			(destination.service === "spotify" &&
				!destination.credentials.clientId) ||
			(destination.service === "youtube" &&
				(!destination.credentials.apiKey ||
					!destination.credentials.clientId)) ||
			(destination.service === "applemusic" &&
				(!destination.credentials.bearer ||
					!destination.credentials.mediaUser)) ||
			// Source credentials (not for text)
			(source.service === "spotify" && !source.credentials.clientId) ||
			(source.service === "youtube" && !source.credentials.apiKey) ||
			(source.service === "applemusic" &&
				(!source.credentials.bearer || !source.credentials.mediaUser));

		if (isInvalid) {
			alert("Please fill in all required credential and name fields.");
			return;
		}

		localStorage.setItem("appState", JSON.stringify(appState));

		if (source.service === "applemusic" && !source.data) {
			const fetcherScript = API.applemusic.getPlaylist(
				source.url,
				source.credentials
			);
			amFetchCodeEl.textContent = fetcherScript;
			const copyBtn = amFetchCodeContainer.querySelector(".copy-button");
			copyBtn.onclick = function () {
				navigator.clipboard.writeText(fetcherScript);
				this.textContent = "Copied!";
				this.style.backgroundColor = "#34c759";
				setTimeout(() => {
					this.textContent = "Copy Code";
					this.style.backgroundColor = "";
				}, 2000);
			};
			showView("view-am-fetch");
		} else {
			startAuthenticationFlow();
		}
	});

	btnContinueToYouTube.addEventListener("click", async () => {
		btnContinueToYouTube.style.display = "none";
		loader.style.display = "block";
		try {
			progressText.textContent = `Authenticating with YouTube...`;
			await API.youtube.configure(appState.destination.credentials.apiKey);
			await API.youtube.authenticate(appState.destination.credentials.clientId);
			await runFullTransferProcess();
		} catch (error) {
			handleError(error);
		}
	});

	const logMessage = (message, type, tracks = []) => {
		const li = document.createElement("li");
		li.className = type;

		let content = `<span>${message}</span>`;
		if (tracks.length > 0) {
			const trackList = `<ul>${tracks
				.map((t) => `<li>${t.title} - ${t.artist}</li>`)
				.join("")}</ul>`;
			content += `<details><summary>Show ${tracks.length} tracks</summary>${trackList}</details>`;
		}
		li.innerHTML = content;
		trackLog.appendChild(li);
		li.scrollIntoView({ behavior: "smooth", block: "end" });
	};

	const startAuthenticationFlow = async () => {
		showView("view-progress");
		trackLog.innerHTML = "";
		try {
			const { source, destination } = appState;

			const needsSpotifySourceAuth = source.service === "spotify";
			const needsSpotifyDestAuth = destination.service === "spotify";
			const needsSpotifyAuth = needsSpotifySourceAuth || needsSpotifyDestAuth;

			const spotifyClientId = needsSpotifySourceAuth
				? source.credentials.clientId
				: destination.credentials.clientId;

			if (needsSpotifyAuth && !API.spotify.accessToken) {
				if (!spotifyClientId) {
					handleError(
						new Error("Spotify Client ID is missing for authentication.")
					);
					return;
				}
				progressText.textContent = `Authenticating with Spotify...`;
				await API.spotify.authenticate(spotifyClientId);
				return;
			}

			if (destination.service === "youtube") {
				progressText.textContent = `Authenticating with YouTube...`;
				await API.youtube.configure(destination.credentials.apiKey);
				await API.youtube.authenticate(destination.credentials.clientId);
			}

			await runFullTransferProcess();
		} catch (error) {
			handleError(error);
		}
	};

	const runFullTransferProcess = async () => {
		try {
			let sourceData;
			if (appState.source.data) {
				sourceData = appState.source.data;
			} else {
				progressText.textContent = `Configuring source: ${appState.source.service}...`;
				if (appState.source.service === "youtube") {
					await API.youtube.configure(appState.source.credentials.apiKey);
				} else if (appState.source.service === "spotify") {
					if (!API.spotify.accessToken)
						throw new Error("Could not get Spotify token for source playlist.");
				}
				progressText.textContent = `Fetching tracks from ${appState.source.service}...`;
				sourceData = await API[appState.source.service].getPlaylist(
					appState.source.url
				);
			}

			logMessage(
				`Found playlist "${sourceData.name}" with ${sourceData.tracks.length} tracks.`,
				"info"
			);

			const newPlaylistName =
				appState.destination.playlistName || sourceData.name;

			if (appState.destination.service === "text") {
				progressText.textContent = "Generating text output...";
				const textOutput = await API.text.createPlaylist(
					newPlaylistName,
					sourceData.tracks,
					logMessage
				);
				progressTitle.textContent = "Export Complete!";
				progressText.innerHTML = `Your playlist is ready. Copy the text below.`;
				trackLog.innerHTML = `<div class="code-block">
                    <button class="copy-button">Copy</button>
                    <pre>${textOutput}</pre>
                 </div>`;
				const copyBtn = trackLog.querySelector(".copy-button");
				copyBtn.addEventListener("click", function () {
					navigator.clipboard.writeText(textOutput);
					this.textContent = "Copied!";
					this.style.backgroundColor = "#34c759";
					setTimeout(() => {
						this.textContent = "Copy";
						this.style.backgroundColor = "";
					}, 2000);
				});
				loader.style.display = "none";
				btnStartOver.style.display = "inline-block";
				return;
			}

			if (appState.destination.service === "applemusic") {
				await API.applemusic.configure(appState.destination.credentials);
				const codeToRun = API.applemusic.createPlaylist(
					newPlaylistName,
					sourceData.tracks
				);
				progressTitle.textContent = "Action Required";
				progressText.innerHTML = `To complete the transfer, copy the code below and run it in the developer console on the <strong>music.apple.com</strong> tab.`;
				trackLog.innerHTML = `<div class="code-block"><button class="copy-button">Copy</button><pre>${codeToRun}</pre></div>`;
				const copyBtn = document.querySelector("#view-progress .copy-button");
				copyBtn.addEventListener("click", function () {
					navigator.clipboard.writeText(codeToRun);
					this.textContent = "Copied!";
					this.style.backgroundColor = "#34c759";
					setTimeout(() => {
						this.textContent = "Copy";
						this.style.backgroundColor = "";
					}, 2000);
				});
				loader.style.display = "none";
				btnStartOver.style.display = "inline-block";
				return;
			}

			progressText.textContent = `Creating playlist "${newPlaylistName}"...`;
			const newPlaylistUrl = await API[
				appState.destination.service
			].createPlaylist(
				newPlaylistName,
				sourceData.tracks,
				logMessage,
				appState.destination.fastTransfer
			);

			progressTitle.textContent = "Transfer Complete!";
			progressText.innerHTML = `Success! Your new playlist is ready.<br><a href="${newPlaylistUrl}" target="_blank">Open Playlist</a>`;
			loader.style.display = "none";
			btnStartOver.style.display = "inline-block";
		} catch (error) {
			if (error.message === "YOUTUBE_QUOTA_EXCEEDED") {
				handleError({
					message:
						"YouTube API daily quota exceeded. Halting transfer. Please try again tomorrow.",
				});
			} else {
				handleError(error);
			}
		} finally {
			if (appState.destination.service !== "applemusic") {
				localStorage.removeItem("appState");
			}
		}
	};

	const handleError = (error) => {
		console.error("Transfer Error:", error);
		progressTitle.textContent = "Transfer Failed";
		let finalErrorMessage = `Error: ${
			error.message || "An unknown error occurred."
		}`;
		if (
			error &&
			error.result &&
			error.result.error &&
			Array.isArray(error.result.error.errors)
		) {
			const detailedError = error.result.error.errors[0];
			if (detailedError && detailedError.reason === "quotaExceeded") {
				finalErrorMessage =
					"Error: YouTube API daily quota exceeded. This is a limit set by Google. Please try again tomorrow.";
			}
		}
		progressText.textContent = finalErrorMessage;
		loader.style.display = "none";
		btnStartOver.style.display = "inline-block";
		localStorage.removeItem("appState");
	};

	const initialize = async () => {
		const currentTheme = localStorage.getItem("theme");
		if (currentTheme) {
			document.documentElement.setAttribute("data-theme", currentTheme);
			themeSwitch.checked = currentTheme === "dark";
		}
		const savedStateJSON = localStorage.getItem("appState");
		if (!savedStateJSON) return;
		const savedState = JSON.parse(savedStateJSON);

		const spotifyClientId =
			savedState.source.service === "spotify"
				? savedState.source.credentials.clientId
				: savedState.destination.credentials.clientId;

		if (spotifyClientId) {
			try {
				API.spotify.clientId = spotifyClientId;
				if (await API.spotify.handleAuthRedirect()) {
					Object.assign(appState, savedState);
					showView("view-progress");
					await runFullTransferProcess();
				}
			} catch (error) {
				handleError(error);
			}
		}
	};

	initialize();
});