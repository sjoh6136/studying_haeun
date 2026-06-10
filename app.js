// --- App State & Audio Management ---
function createSimpleAudio(src) {
    const audio = new Audio(src);
    audio.addEventListener('error', (e) => {
        console.error(`Failed to load audio: ${src}`, e);
    });
    return audio;
}

const state = {
    // Timer
    timer: null,
    timeLeft: 25 * 60,
    totalTime: 25 * 60,
    timerMode: 'work', // 'work', 'short', 'long'
    timerRunning: false,

    // Cumulative Focus & Stats
    accumulatedTime: 0,   // seconds since last tree completion
    dailyFocusTime: 0,    // total focus minutes today
    treesPlantedCount: 0, // count of planted trees today
    sessionHistory: [],   // list of session records: { time: String, duration: Number, tree: String/null }
    plantedTrees: [],     // array of grown tree emojis

    // Audio Files (Local mp3 assets)
    sounds: {
        rain: createSimpleAudio('./assets/sounds/rain.mp3'),
        fireplace: createSimpleAudio('./assets/sounds/fireplace.mp3'),
        cafe: createSimpleAudio('./assets/sounds/cafe.mp3'),
        forest: createSimpleAudio('./assets/sounds/forest.mp3')
    },

    // Local Music Loop Assets
    music: {
        lofigirl: createSimpleAudio('./assets/music/lofigirl.mp3'),
        chillhop: createSimpleAudio('./assets/music/chillhop.mp3'),
        synthwave: createSimpleAudio('./assets/music/synthwave.mp3'),
        jazz: createSimpleAudio('./assets/music/jazz.mp3')
    },
    activeMusic: 'lofigirl',
    musicMode: 'local', // 'local' or 'youtube'
    musicPlaying: false,

    // Music Player Presets (Stable, long-running official YouTube video compilations)
    stations: {
        lofigirl: 'a5sdsbGKz8U',  // Lofi Girl Study Beats Mix
        chillhop: '7NOSDKb0HGQ',  // Chillhop Essentials
        synthwave: '39vZ004kK_w', // Retro Synthwave Mix
        jazz: '2mBDG4kE6M0'       // Jazz Lofi Compilation
    },
    activeStation: 'lofigirl',
    ytPlayer: null,
    ytReady: false,
    ytPlaying: false,

    // Focus Mode (Screensaver)
    focusMode: false,
    focusHintTimeout: null,
    
    // Stretch reminder toggle
    stretchEnabled: true
};

// Configure all ambient loops
Object.values(state.sounds).forEach(audio => {
    audio.loop = true;
    audio.preload = 'metadata'; // Use 'metadata' to avoid clogging network for large files
});

// Configure local music loops
Object.values(state.music).forEach(audio => {
    audio.loop = true;
    audio.preload = 'metadata';
});

// Tree grow helper stages
const TREE_STAGES = ['🌰 씨앗', '🌱 새싹', '🌿 묘목', '🌳 어린 나무', '🌲 큰 나무', '🌸 꽃피운 나무'];
const TREE_EMOJIS = ['🌰', '🌱', '🌿', '🌳', '🌲', '🌸'];

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initStats();
    initTabs();
    initTimer();
    initMixer();
    initPlayer();
    initMemo();
    initSettings();
    initFocusMode();
    initBreathingGuide();
    initStretchReminder();
    
    // Initial growing plant render
    updateGrowingPlantUI();
});

// --- Tab Switcher ---
function initTabs() {
    const focusBtn = document.getElementById('tab-btn-focus');
    const statsBtn = document.getElementById('tab-btn-stats');
    const focusPane = document.getElementById('tab-focus-space');
    const statsPane = document.getElementById('tab-garden-stats');

    const switchTab = (tabName) => {
        if (tabName === 'focus') {
            focusBtn.classList.add('active');
            statsBtn.classList.remove('active');
            focusPane.classList.add('active');
            statsPane.classList.remove('active');
        } else {
            focusBtn.classList.remove('active');
            statsBtn.classList.add('active');
            focusPane.classList.remove('active');
            statsPane.classList.add('active');
            updateStatsTab(); // Reload statistics data
        }
    };

    focusBtn.addEventListener('click', () => switchTab('focus'));
    statsBtn.addEventListener('click', () => switchTab('stats'));
}

// --- Clock Widget ---
function initClock() {
    const timeEl = document.getElementById('clock-time');
    const dateEl = document.getElementById('clock-date');

    const formatNumber = num => String(num).padStart(2, '0');
    
    const updateTime = () => {
        const now = new Date();
        
        // Time HH:MM:SS
        const hours = formatNumber(now.getHours());
        const minutes = formatNumber(now.getMinutes());
        const seconds = formatNumber(now.getSeconds());
        timeEl.textContent = `${hours}:${minutes}:${seconds}`;

        // Date YYYY년 MM월 DD일 Day
        const year = now.getFullYear();
        const month = formatNumber(now.getMonth() + 1);
        const date = formatNumber(now.getDate());
        
        const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
        const dayName = days[now.getDay()];
        
        dateEl.textContent = `${year}년 ${month}월 ${date}일 ${dayName}`;
    };

    updateTime();
    setInterval(updateTime, 1000);
}

// --- Focus Timer (Pomodoro) ---
function initTimer() {
    const timeEl = document.getElementById('timer-time');
    const startBtn = document.getElementById('btn-timer-start');
    const pauseBtn = document.getElementById('btn-timer-pause');
    const resetBtn = document.getElementById('btn-timer-reset');
    const modeBtns = document.querySelectorAll('.timer-mode-btn');
    const circle = document.getElementById('timer-progress');
    
    // iOS Picker elements
    const pickerContainer = document.getElementById('ios-time-picker');
    const wheelHours = document.getElementById('picker-wheel-hours');
    const wheelMinutes = document.getElementById('picker-wheel-minutes');
    const wheelSeconds = document.getElementById('picker-wheel-seconds');
    
    // Circle properties
    const radius = circle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = 0;

    const setProgress = percent => {
        const offset = circumference - (percent * circumference);
        circle.style.strokeDashoffset = offset;
    };

    // Render picker options
    const renderWheelOptions = (wheel, count) => {
        const wrapper = wheel.querySelector('.picker-scroll-wrapper');
        wrapper.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const item = document.createElement('div');
            item.className = 'picker-item';
            item.textContent = String(i).padStart(2, '0');
            item.dataset.value = i;
            
            // Add click-to-select support
            item.addEventListener('click', () => {
                if (state.timerRunning) return;
                const itemHeight = 32;
                wheel.scrollTo({
                    top: i * itemHeight,
                    behavior: 'smooth'
                });
            });
            wrapper.appendChild(item);
        }
    };

    renderWheelOptions(wheelHours, 24);
    renderWheelOptions(wheelMinutes, 60);
    renderWheelOptions(wheelSeconds, 60);

    const updatePickerItemStyles = (wheel, activeIndex) => {
        const items = wheel.querySelectorAll('.picker-item');
        items.forEach((item, i) => {
            const diff = i - activeIndex;
            const angle = diff * 20; // Cylinder 3D rot angle
            
            item.style.transform = `rotateX(${angle}deg) translateZ(12px)`;
            if (i === activeIndex) {
                item.classList.add('active');
                item.style.opacity = 1;
            } else {
                item.classList.remove('active');
                item.style.opacity = Math.max(0.2, 1 - Math.abs(diff) * 0.35);
            }
        });
    };

    let isSyncingFromWheel = false;

    const syncTimeFromWheels = () => {
        if (state.timerRunning || isSyncingFromWheel) return;
        isSyncingFromWheel = true;
        
        const h = getWheelCurrentValue(wheelHours);
        const m = getWheelCurrentValue(wheelMinutes);
        const s = getWheelCurrentValue(wheelSeconds);
        
        const totalSeconds = (h * 3600) + (m * 60) + s;
        
        if (totalSeconds > 0) {
            state.totalTime = totalSeconds;
            state.timeLeft = totalSeconds;
        } else {
            // Default back to 25 mins if all zeroed out
            state.totalTime = 1500;
            state.timeLeft = 1500;
        }
        
        updateDisplay();
        isSyncingFromWheel = false;
    };

    const getWheelCurrentValue = (wheel) => {
        const itemHeight = 32;
        const index = Math.round(wheel.scrollTop / itemHeight);
        const count = wheel.querySelectorAll('.picker-item').length;
        const clampedIndex = Math.max(0, Math.min(count - 1, index));
        return clampedIndex;
    };

    const scrollWheelToValue = (wheel, value, smooth = true) => {
        const itemHeight = 32;
        const targetScroll = value * itemHeight;
        wheel.scrollTo({
            top: targetScroll,
            behavior: smooth ? 'smooth' : 'auto'
        });
        updatePickerItemStyles(wheel, value);
    };

    // Scroll & Drag & Wheel event listeners
    const setupWheelScrollListener = (wheel) => {
        let scrollTimeout;
        
        // 1. Scroll listener for snap updating
        wheel.addEventListener('scroll', () => {
            const currentIdx = getWheelCurrentValue(wheel);
            updatePickerItemStyles(wheel, currentIdx);
            
            if (!state.timerRunning) {
                const h = wheel === wheelHours ? currentIdx : getWheelCurrentValue(wheelHours);
                const m = wheel === wheelMinutes ? currentIdx : getWheelCurrentValue(wheelMinutes);
                const s = wheel === wheelSeconds ? currentIdx : getWheelCurrentValue(wheelSeconds);
                
                if (h > 0) {
                    timeEl.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                } else {
                    timeEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                }
            }
            
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                syncTimeFromWheels();
            }, 150);
        });

        // 2. Mouse Wheel Sensitivity Fix (One Notch = One Item)
        wheel.addEventListener('wheel', (e) => {
            if (state.timerRunning) return;
            e.preventDefault();
            const direction = e.deltaY > 0 ? 1 : -1;
            const currentIdx = getWheelCurrentValue(wheel);
            let targetIdx = currentIdx + direction;
            const count = wheel.querySelectorAll('.picker-item').length;
            targetIdx = Math.max(0, Math.min(count - 1, targetIdx));
            
            scrollWheelToValue(wheel, targetIdx, true);
        }, { passive: false });

        // 3. Mouse Drag-to-Scroll Support
        let isDown = false;
        let startY;
        let scrollTop;

        wheel.addEventListener('mousedown', (e) => {
            if (state.timerRunning) return;
            isDown = true;
            wheel.classList.add('active-dragging');
            startY = e.pageY - wheel.offsetTop;
            scrollTop = wheel.scrollTop;
        });

        const handleDragEnd = () => {
            if (!isDown) return;
            isDown = false;
            wheel.classList.remove('active-dragging');
            
            // Snap cleanly to the nearest item on release
            const currentIdx = getWheelCurrentValue(wheel);
            scrollWheelToValue(wheel, currentIdx, true);
        };

        wheel.addEventListener('mouseup', handleDragEnd);
        wheel.addEventListener('mouseleave', handleDragEnd);

        wheel.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const y = e.pageY - wheel.offsetTop;
            const walk = (y - startY) * 1.5; // Drag distance multiplier
            wheel.scrollTop = scrollTop - walk;
        });
    };

    setupWheelScrollListener(wheelHours);
    setupWheelScrollListener(wheelMinutes);
    setupWheelScrollListener(wheelSeconds);

    const updateDisplay = () => {
        const hours = Math.floor(state.timeLeft / 3600);
        const minutes = Math.floor((state.timeLeft % 3600) / 60);
        const seconds = state.timeLeft % 60;
        
        if (hours > 0) {
            timeEl.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        } else {
            timeEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        
        const progress = state.timeLeft / state.totalTime;
        setProgress(progress);
    };

    const setMode = mode => {
        state.timerMode = mode;
        state.timerRunning = false;
        clearInterval(state.timer);
        
        modeBtns.forEach(btn => {
            if (btn.dataset.mode === mode) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        let defaultSeconds = 25 * 60;
        if (mode === 'work') {
            defaultSeconds = 25 * 60;
        } else if (mode === 'short') {
            defaultSeconds = 5 * 60;
        } else if (mode === 'long') {
            defaultSeconds = 15 * 60;
        }
        
        state.timeLeft = defaultSeconds;
        state.totalTime = defaultSeconds;
        
        const h = Math.floor(defaultSeconds / 3600);
        const m = Math.floor((defaultSeconds % 3600) / 60);
        const s = defaultSeconds % 60;
        
        scrollWheelToValue(wheelHours, h);
        scrollWheelToValue(wheelMinutes, m);
        scrollWheelToValue(wheelSeconds, s);
        
        updateDisplay();
        pickerContainer.classList.remove('disabled');
        startBtn.disabled = false;
        pauseBtn.disabled = true;
    };

    const startTimer = () => {
        if (state.timerRunning) return;
        state.timerRunning = true;
        startBtn.disabled = true;
        pauseBtn.disabled = false;
        pickerContainer.classList.add('disabled');

        state.timer = setInterval(() => {
            state.timeLeft--;
            
            if (state.timerMode === 'work') {
                state.accumulatedTime++;
                updateGrowingPlantUI();
                
                if (state.accumulatedTime >= 50 * 60) {
                    clearInterval(state.timer);
                    state.timerRunning = false;
                    pickerContainer.classList.remove('disabled');
                    playChimeSound();
                    
                    state.plantedTrees.push('🌸');
                    state.treesPlantedCount = state.plantedTrees.length;
                    localStorage.setItem('study-space-planted-trees', JSON.stringify(state.plantedTrees));
                    
                    state.dailyFocusTime += Math.round(state.totalTime / 60);
                    localStorage.setItem('study-space-daily-focus', String(state.dailyFocusTime));
                    
                    const now = new Date();
                    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                    state.sessionHistory.unshift({
                        time: timeStr,
                        duration: Math.round(state.totalTime / 60),
                        tree: '🌸'
                    });
                    localStorage.setItem('study-space-sessions', JSON.stringify(state.sessionHistory));
                    
                    state.accumulatedTime = 0;
                    updateGrowingPlantUI();
                    
                    if (state.stretchEnabled && typeof window.triggerStretchReminder === 'function') {
                        setTimeout(() => {
                            window.triggerStretchReminder(600);
                        }, 500);
                    }
                    
                    setMode('short');
                    return;
                }
            }

            updateDisplay();

            if (state.timeLeft <= 0) {
                clearInterval(state.timer);
                state.timerRunning = false;
                pickerContainer.classList.remove('disabled');
                playChimeSound();
                
                const focusMinutes = Math.round(state.totalTime / 60);
                
                if (state.timerMode === 'work') {
                    state.dailyFocusTime += focusMinutes;
                    localStorage.setItem('study-space-daily-focus', String(state.dailyFocusTime));
                    
                    const now = new Date();
                    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                    state.sessionHistory.unshift({
                        time: timeStr,
                        duration: focusMinutes,
                        tree: null
                    });
                    localStorage.setItem('study-space-sessions', JSON.stringify(state.sessionHistory));

                    if (state.stretchEnabled && typeof window.triggerStretchReminder === 'function') {
                        setTimeout(() => {
                            window.triggerStretchReminder(300);
                        }, 500);
                    } else {
                        alert(`공부 시간이 끝났습니다! (${focusMinutes}분 집중 완료)`);
                    }
                    setMode('short');
                } else {
                    alert('휴식 시간이 끝났습니다! 다시 시작해볼까요?');
                    setMode('work');
                }
            }
        }, 1000);
    };

    const pauseTimer = () => {
        if (!state.timerRunning) return;
        state.timerRunning = false;
        clearInterval(state.timer);
        pickerContainer.classList.remove('disabled');
        startBtn.disabled = false;
        pauseBtn.disabled = true;
        
        const hours = Math.floor(state.timeLeft / 3600);
        const minutes = Math.floor((state.timeLeft % 3600) / 60);
        const seconds = state.timeLeft % 60;
        
        scrollWheelToValue(wheelHours, hours);
        scrollWheelToValue(wheelMinutes, minutes);
        scrollWheelToValue(wheelSeconds, seconds);
    };

    const resetTimer = () => {
        setMode(state.timerMode);
    };

    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });

    startBtn.addEventListener('click', startTimer);
    pauseBtn.addEventListener('click', pauseTimer);
    resetBtn.addEventListener('click', resetTimer);

    // Initial state
    setMode('work');
}

// --- Synthesizer Bell/Chime Sound (Web Audio API) ---
function playChimeSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const playTone = (freq, startTime, duration) => {
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, startTime);
            
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(0.12, startTime + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            
            osc.start(startTime);
            osc.stop(startTime + duration);
        };
        
        const now = audioCtx.currentTime;
        // Clean major chord chime (C5 -> E5 -> G5)
        playTone(523.25, now, 0.8);       // C5
        playTone(659.25, now + 0.15, 0.8); // E5
        playTone(783.99, now + 0.3, 0.8);  // G5
    } catch (e) {
        console.error("Web Audio API not supported or blocked: ", e);
    }
}

// --- Ambient Sound Mixer ---
function initMixer() {
    const channels = document.querySelectorAll('.mixer-channel');
    const rainOverlay = document.getElementById('rain-overlay');

    channels.forEach(channel => {
        const soundKey = channel.dataset.sound;
        const toggleBtn = channel.querySelector('.sound-toggle-btn');
        const slider = channel.querySelector('.sound-volume-slider');
        const audio = state.sounds[soundKey];

        const updateVolume = () => {
            const vol = parseFloat(slider.value) / 100;
            audio.volume = vol;
            
            if (vol > 0) {
                if (audio.paused) {
                    console.log(`Attempting to play: ${soundKey} (${audio.src})`);
                    audio.play()
                        .then(() => console.log(`Successfully playing: ${soundKey}`))
                        .catch(err => {
                            console.error(`Error playing ${soundKey}:`, err);
                            if (audio.readyState < 2) {
                                console.warn(`${soundKey} is still loading... Current state: ${audio.readyState} (Need 2 or higher)`);
                            }
                        });
                }
                channel.classList.add('active');
                if (soundKey === 'rain') rainOverlay.classList.add('active');
            } else {
                audio.pause();
                channel.classList.remove('active');
                if (soundKey === 'rain') rainOverlay.classList.remove('active');
            }
        };

        toggleBtn.addEventListener('click', () => {
            if (slider.value == 0) {
                slider.value = 40;
            } else {
                slider.value = 0;
            }
            updateVolume();
        });

        slider.addEventListener('input', updateVolume);
    });
}

// --- YouTube Lo-Fi Player API Integration ---
function initPlayer() {
    const playBtn = document.getElementById('btn-music-play');
    const playIcon = playBtn.querySelector('span');
    const volumeSlider = document.getElementById('slider-music-volume');
    const stationBtns = document.querySelectorAll('.station-btn');
    
    const loadCustomBtn = document.getElementById('btn-load-custom');
    const customUrlInput = document.getElementById('input-custom-youtube');

    // Preload & Loop local music
    Object.values(state.music).forEach(audio => {
        audio.loop = true;
        audio.preload = 'metadata';
    });

    if (!window.YT) {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }

    window.onYouTubeIframeAPIReady = () => {
        state.ytPlayer = new YT.Player('youtube-player', {
            videoId: state.stations['lofigirl'], // Dummy initial video
            playerVars: {
                'playsinline': 1,
                'controls': 0,
                'disablekb': 1,
                'fs': 0,
                'rel': 0,
                'enablejsapi': 1
            },
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange
            }
        });
    };

    function onPlayerReady(event) {
        state.ytReady = true;
        event.target.setVolume(volumeSlider.value);
    }

    function onPlayerStateChange(event) {
        const playerCard = document.getElementById('widget-player');
        if (event.data === YT.PlayerState.PLAYING) {
            state.ytPlaying = true;
            playIcon.textContent = 'pause_circle';
            playerCard.classList.add('playing');
        } else {
            state.ytPlaying = false;
            if (state.musicMode === 'youtube') {
                playIcon.textContent = 'play_circle';
                playerCard.classList.remove('playing');
            }
        }
    }

    const getActiveLocalAudio = () => state.music[state.activeMusic];

    const updatePlayState = () => {
        const playerCard = document.getElementById('widget-player');
        
        if (state.musicMode === 'local') {
            // Stop YouTube if active
            if (state.ytReady && state.ytPlaying) {
                state.ytPlayer.pauseVideo();
            }
            
            const audio = getActiveLocalAudio();
            if (state.musicPlaying) {
                audio.volume = parseFloat(volumeSlider.value) / 100;
                audio.play().catch(err => console.log("Local music block: ", err));
                playIcon.textContent = 'pause_circle';
                playerCard.classList.add('playing');
            } else {
                audio.pause();
                playIcon.textContent = 'play_circle';
                playerCard.classList.remove('playing');
            }
        } else { // 'youtube'
            // Stop Local Music if active
            Object.values(state.music).forEach(audio => audio.pause());
            
            if (state.ytReady) {
                if (state.musicPlaying) {
                    state.ytPlayer.setVolume(volumeSlider.value);
                    state.ytPlayer.playVideo();
                } else {
                    state.ytPlayer.pauseVideo();
                }
            }
        }
    };

    const updateTrackInfo = (musicKey, customTitle = null) => {
        const titleEl = document.getElementById('track-title');
        const artistEl = document.getElementById('track-artist');

        if (customTitle) {
            titleEl.textContent = customTitle;
            artistEl.textContent = "사용자 커스텀 음악";
            return;
        }

        const titles = {
            lofigirl: "Lofi Girl Study Session",
            chillhop: "Chillhop Cafe Beats",
            synthwave: "Retro Synthwave Drive",
            jazz: "Soft Jazz Cafe Acoustics"
        };

        const artists = {
            lofigirl: "Local Audio Loop",
            chillhop: "Local Audio Loop",
            synthwave: "Local Audio Loop",
            jazz: "Local Audio Loop"
        };

        titleEl.textContent = titles[musicKey] || "선택된 음악 없음";
        artistEl.textContent = artists[musicKey] || "Local Music Loop";
    };

    playBtn.addEventListener('click', () => {
        state.musicPlaying = !state.musicPlaying;
        updatePlayState();
    });

    volumeSlider.addEventListener('input', () => {
        if (state.musicMode === 'local') {
            getActiveLocalAudio().volume = parseFloat(volumeSlider.value) / 100;
        } else if (state.ytReady) {
            state.ytPlayer.setVolume(volumeSlider.value);
        }
    });

    stationBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const musicKey = btn.dataset.station;
            
            // Stop previous local music
            const prevAudio = getActiveLocalAudio();
            prevAudio.pause();
            prevAudio.currentTime = 0;

            stationBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            state.musicMode = 'local';
            state.activeMusic = musicKey;
            updateTrackInfo(musicKey);
            updatePlayState();
        });
    });

    const loadCustomTrack = () => {
        const url = customUrlInput.value.trim();
        if (!url) return;

        const videoId = extractVideoId(url);
        if (videoId) {
            // Stop local music
            const prevAudio = getActiveLocalAudio();
            prevAudio.pause();
            prevAudio.currentTime = 0;

            stationBtns.forEach(b => b.classList.remove('active'));
            updateTrackInfo(null, "지정된 스트림");
            
            state.musicMode = 'youtube';
            state.musicPlaying = true;
            
            if (state.ytReady) {
                state.ytPlayer.loadVideoById(videoId);
                state.ytPlayer.playVideo();
            }
            customUrlInput.value = '';
        } else {
            alert('올바른 YouTube 주소가 아닙니다. 주소를 확인해 주세요.');
        }
    };

    loadCustomBtn.addEventListener('click', loadCustomTrack);
    customUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loadCustomTrack();
    });

    // Initial load local Lofi Girl
    updateTrackInfo(state.activeMusic);
}

function extractVideoId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// --- Persistent Memo Pad (To-Do List) ---
function initMemo() {
    const input = document.getElementById('input-todo');
    const addBtn = document.getElementById('btn-todo-add');
    const todoListEl = document.getElementById('todo-list');

    let todos = [];
    const saved = localStorage.getItem('study-space-todos');
    if (saved) {
        try {
            todos = JSON.parse(saved);
        } catch (e) {
            todos = [];
        }
    }

    const saveTodos = () => {
        localStorage.setItem('study-space-todos', JSON.stringify(todos));
    };

    const renderTodos = () => {
        todoListEl.innerHTML = '';
        todos.forEach((todo, idx) => {
            const li = document.createElement('li');
            li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
            
            li.innerHTML = `
                <div class="todo-text-wrapper">
                    <span class="material-symbols-rounded todo-checkbox">
                        ${todo.completed ? 'check_box' : 'check_box_outline_blank'}
                    </span>
                    <span class="todo-text">${escapeHtml(todo.text)}</span>
                </div>
                <button class="todo-delete-btn" title="삭제">
                    <span class="material-symbols-rounded">delete</span>
                </button>
            `;

            li.querySelector('.todo-text-wrapper').addEventListener('click', () => {
                todos[idx].completed = !todos[idx].completed;
                saveTodos();
                renderTodos();
            });

            li.querySelector('.todo-delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                todos.splice(idx, 1);
                saveTodos();
                renderTodos();
            });

            todoListEl.appendChild(li);
        });
    };

    const addTodo = () => {
        const text = input.value.trim();
        if (!text) return;

        todos.push({
            text: text,
            completed: false
        });
        
        input.value = '';
        saveTodos();
        renderTodos();
    };

    addBtn.addEventListener('click', addTodo);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTodo();
    });

    renderTodos();
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// --- Display Settings ---
function initSettings() {
    const settingsBtn = document.getElementById('btn-settings');
    const closeBtn = document.getElementById('btn-close-settings');
    const panel = document.getElementById('settings-panel');
    
    const opacitySlider = document.getElementById('slider-bg-opacity');
    const bgOverlay = document.querySelector('.bg-overlay');
    
    const themeBtns = document.querySelectorAll('.theme-select-btn');
    const testSoundBtn = document.getElementById('btn-test-sound');

    settingsBtn.addEventListener('click', () => panel.classList.add('active'));
    closeBtn.addEventListener('click', () => panel.classList.remove('active'));
    
    panel.addEventListener('click', (e) => {
        if (e.target === panel) panel.classList.remove('active');
    });

    opacitySlider.addEventListener('input', () => {
        const opacity = parseFloat(opacitySlider.value) / 100;
        bgOverlay.style.backgroundColor = `rgba(5, 6, 12, ${opacity})`;
    });

    themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            themeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const theme = btn.dataset.theme;
            document.body.classList.remove('theme-dark-purple', 'theme-forest-green');
            
            if (theme !== 'default') {
                document.body.classList.add(`theme-${theme}`);
            }
        });
    });

    testSoundBtn.addEventListener('click', () => {
        playChimeSound();
    });
}

// --- Screensaver Focus Mode ---
function initFocusMode() {
    const focusBtn = document.getElementById('btn-focus-mode');
    const exitHint = document.getElementById('focus-exit-hint');

    const toggleFocusMode = () => {
        state.focusMode = !state.focusMode;
        
        if (state.focusMode) {
            document.body.classList.add('focus-mode-active');
            showFocusHint();
        } else {
            document.body.classList.remove('focus-mode-active');
            exitHint.classList.remove('visible');
            clearTimeout(state.focusHintTimeout);
        }
    };

    const showFocusHint = () => {
        exitHint.classList.add('visible');
        clearTimeout(state.focusHintTimeout);
        
        state.focusHintTimeout = setTimeout(() => {
            exitHint.classList.remove('visible');
        }, 3500);
    };

    focusBtn.addEventListener('click', toggleFocusMode);

    document.addEventListener('dblclick', (e) => {
        if (state.focusMode) {
            toggleFocusMode();
        }
    });

    document.addEventListener('mousemove', () => {
        if (state.focusMode) {
            showFocusHint();
        }
    });
}

// --- Breathing / Meditation Widget ---
function initBreathingGuide() {
    const breathingText = document.getElementById('breathing-text');
    
    setInterval(() => {
        const text = breathingText.textContent;
        if (text.includes('(들숨)')) {
            breathingText.textContent = "천천히 숨을 내쉬세요 (날숨)";
        } else {
            breathingText.textContent = "잠시 심호흡해 보세요 (들숨)";
        }
    }, 4000);
}

// --- Daily Statistics & Plants Database ---
function initStats() {
    const todayStr = new Date().toISOString().split('T')[0];
    const lastDay = localStorage.getItem('study-space-last-day');
    
    if (lastDay !== todayStr) {
        // Reset stats on new day
        localStorage.setItem('study-space-daily-focus', '0');
        localStorage.setItem('study-space-planted-trees', '[]');
        localStorage.setItem('study-space-sessions', '[]');
        localStorage.setItem('study-space-last-day', todayStr);
        
        state.dailyFocusTime = 0;
        state.plantedTrees = [];
        state.sessionHistory = [];
    } else {
        state.dailyFocusTime = parseInt(localStorage.getItem('study-space-daily-focus')) || 0;
        try {
            state.plantedTrees = JSON.parse(localStorage.getItem('study-space-planted-trees')) || [];
            state.sessionHistory = JSON.parse(localStorage.getItem('study-space-sessions')) || [];
        } catch(e) {
            state.plantedTrees = [];
            state.sessionHistory = [];
        }
    }
    state.treesPlantedCount = state.plantedTrees.length;
}

function updateStatsTab() {
    const timeEl = document.getElementById('stats-total-focus-time');
    const countEl = document.getElementById('stats-total-trees-planted');
    const forestGrid = document.getElementById('forest-grid');
    const emptyMsg = document.getElementById('forest-empty-msg');

    if (timeEl) timeEl.textContent = `${state.dailyFocusTime}분`;
    if (countEl) countEl.textContent = `${state.treesPlantedCount}그루`;

    if (forestGrid) {
        forestGrid.innerHTML = '';
        if (state.plantedTrees.length > 0) {
            if (emptyMsg) emptyMsg.style.display = 'none';
            state.plantedTrees.forEach(emoji => {
                const div = document.createElement('div');
                div.className = 'planted-tree';
                div.textContent = emoji;
                div.title = "완전히 피어난 나무!";
                forestGrid.appendChild(div);
            });
        } else {
            if (emptyMsg) emptyMsg.style.display = 'block';
        }
    }
}

// --- Tree Growth calculation logic ---
function getTreeStageInfo(seconds) {
    const minutes = Math.floor(seconds / 60);
    let stage = 0;
    if (minutes >= 50) stage = 5;
    else if (minutes >= 40) stage = 4;
    else if (minutes >= 30) stage = 3;
    else if (minutes >= 20) stage = 2;
    else if (minutes >= 10) stage = 1;
    
    const stageName = TREE_STAGES[stage];
    const emoji = TREE_EMOJIS[stage];
    
    const nextStageTime = (stage + 1) * 10;
    const currentStageTime = stage * 10;
    let nextStageRemaining = nextStageTime - minutes;
    if (nextStageRemaining < 0) nextStageRemaining = 0;
    
    let stageProgressPercent = 0;
    if (stage < 5) {
        const stageSeconds = seconds - (currentStageTime * 60);
        stageProgressPercent = Math.min(100, Math.round((stageSeconds / 600) * 100));
    } else {
        stageProgressPercent = 100;
    }

    return {
        stage,
        stageName,
        emoji,
        nextStageRemaining,
        progress: stageProgressPercent
    };
}

function updateGrowingPlantUI() {
    const activePlantGraphic = document.getElementById('active-plant-graphic');
    const stageTitle = document.getElementById('plant-stage-title');
    const progressBar = document.getElementById('active-plant-progress');
    const progressText = document.getElementById('active-plant-progress-text');

    if (!activePlantGraphic) return;

    const info = getTreeStageInfo(state.accumulatedTime);
    activePlantGraphic.textContent = info.emoji;
    stageTitle.textContent = info.stageName;
    progressBar.style.width = `${info.progress}%`;
    
    if (info.stage < 5) {
        progressText.textContent = `성장도: ${info.progress}% (다음 단계까지 ${info.nextStageRemaining}분 남음)`;
    } else {
        progressText.textContent = `성장도: 100%! 정원에 심어질 준비가 되었습니다.`;
    }
}

// --- Immersive Stretch Reminder Overlay ---
function initStretchReminder() {
    const overlay = document.getElementById('stretch-overlay');
    const skipBtn = document.getElementById('btn-stretch-skip');
    const completeBtn = document.getElementById('btn-stretch-complete');
    
    const checkbox = document.getElementById('checkbox-stretch-enable');
    const saved = localStorage.getItem('study-space-stretch-enabled');
    if (saved !== null) {
        state.stretchEnabled = saved === 'true';
    } else {
        state.stretchEnabled = true;
    }
    checkbox.checked = state.stretchEnabled;
    checkbox.addEventListener('change', () => {
        state.stretchEnabled = checkbox.checked;
        localStorage.setItem('study-space-stretch-enabled', state.stretchEnabled);
    });

    let stretchInterval = null;
    let secondsLeft = 45;

    const startStretchCountdown = (durationSeconds = 45) => {
        secondsLeft = durationSeconds;
        const totalDuration = durationSeconds;
        
        const bar = document.getElementById('stretch-timer-bar');
        const text = document.getElementById('stretch-timer-text');
        const steps = [
            document.getElementById('stretch-step-1'),
            document.getElementById('stretch-step-2'),
            document.getElementById('stretch-step-3')
        ];

        bar.style.width = '100%';
        text.textContent = `${secondsLeft}초 남음`;
        
        steps.forEach(s => s.classList.remove('active'));
        steps[0].classList.add('active');

        completeBtn.style.display = 'none';
        skipBtn.style.display = 'block';

        clearInterval(stretchInterval);
        stretchInterval = setInterval(() => {
            secondsLeft--;
            
            if (secondsLeft >= 60) {
                const mins = Math.floor(secondsLeft / 60);
                const secs = secondsLeft % 60;
                text.textContent = `${mins}분 ${secs}초 남음`;
            } else {
                text.textContent = `${secondsLeft}초 남음`;
            }
            
            bar.style.width = `${(secondsLeft / totalDuration) * 100}%`;

            const third = totalDuration / 3;
            if (secondsLeft > third * 2) {
                steps[0].classList.add('active');
                steps[1].classList.remove('active');
                steps[2].classList.remove('active');
            } else if (secondsLeft > third) {
                steps[0].classList.remove('active');
                steps[1].classList.add('active');
                steps[2].classList.remove('active');
            } else if (secondsLeft > 0) {
                steps[0].classList.remove('active');
                steps[1].classList.remove('active');
                steps[2].classList.add('active');
            } else {
                clearInterval(stretchInterval);
                steps[2].classList.remove('active');
                text.textContent = "스트레칭 완료!";
                skipBtn.style.display = 'none';
                completeBtn.style.display = 'block';
                playChimeSound();
            }
        }, 1000);
    };

    window.triggerStretchReminder = (durationSeconds = 45) => {
        overlay.classList.add('active');
        startStretchCountdown(durationSeconds);
    };

    const closeStretch = () => {
        overlay.classList.remove('active');
        clearInterval(stretchInterval);
    };

    skipBtn.addEventListener('click', closeStretch);
    completeBtn.addEventListener('click', closeStretch);
}
