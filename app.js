// --- App State & Audio Management ---

const API_BASE_URL = 'http://localhost:5000/api';

const TREE_EMOJIS = ['🌰', '🌱', '🌿', '🌲', '🌳', '🌸'];
const TREE_STAGES = ['씨앗 (Seed)', '새싹 (Sprout)', '묘목 (Sapling)', '어린 나무 (Young Tree)', '성장한 나무 (Mature Tree)', '만개한 나무 (Blossomed Tree)'];

function formatSecondsToHHMMSS(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function createAutocorrectAudio(src) {
    const isMusic = src.includes('/music/');
    const folderName = isMusic ? 'music' : 'sounds';
    const fileNameWithExt = src.substring(src.lastIndexOf('/') + 1);
    const dotIdx = fileNameWithExt.lastIndexOf('.');
    const name = fileNameWithExt.substring(0, dotIdx);
    const ext = fileNameWithExt.substring(dotIdx);

    const capitalizedFolder = folderName.charAt(0).toUpperCase() + folderName.slice(1);
    const capitalizedFile = name.charAt(0).toUpperCase() + name.slice(1);
    const uppercaseFile = name.toUpperCase();
    const lowercaseExt = ext.toLowerCase();
    const uppercaseExt = ext.toUpperCase();

    const folderBases = [
        `./assets/${folderName}/`,
        `./Assets/${folderName}/`,
        `./assets/${capitalizedFolder}/`,
        `./Assets/${capitalizedFolder}/`
    ];

    const filenames = [
        name + lowercaseExt,
        capitalizedFile + lowercaseExt,
        uppercaseFile + lowercaseExt,
        name + uppercaseExt,
        capitalizedFile + uppercaseExt,
        uppercaseFile + uppercaseExt
    ];

    const candidates = [];
    folderBases.forEach(fb => {
        filenames.forEach(fn => {
            candidates.push(fb + fn);
        });
    });

    const uniqueCandidates = [...new Set(candidates)];
    const audio = new Audio(uniqueCandidates[0]);
    let attempt = 0;

    audio.addEventListener('error', function handleError(e) {
        attempt++;
        if (attempt < uniqueCandidates.length) {
            console.log(`Failed to load ${audio.src}, trying fallback: ${uniqueCandidates[attempt]}`);
            
            const currentVol = audio.volume;
            const currentLoop = audio.loop;
            const wasPlaying = !audio.paused;
            
            audio.src = uniqueCandidates[attempt];
            audio.volume = currentVol;
            audio.loop = currentLoop;
            audio.load();
            
            if (wasPlaying) {
                audio.play().catch(err => console.log("Autocorrect play block: ", err));
            }
        } else {
            console.error(`All attempts failed to load audio for: ${src}`);
        }
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
        rain: createAutocorrectAudio('./assets/sounds/rain.mp3'),
        fireplace: createAutocorrectAudio('./assets/sounds/fireplace.mp3'),
        cafe: createAutocorrectAudio('./assets/sounds/cafe.mp3'),
        forest: createAutocorrectAudio('./assets/sounds/forest.mp3')
    },

    // Local Music Loop Assets
    music: {
        lofigirl: createAutocorrectAudio('./assets/music/lofigirl.mp3'),
        chillhop: createAutocorrectAudio('./assets/music/chillhop.mp3'),
        synthwave: createAutocorrectAudio('./assets/music/synthwave.mp3'),
        jazz: createAutocorrectAudio('./assets/music/jazz.mp3')
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
    stretchEnabled: true,

    // User authentication state
    user: null
};

// Configure all ambient loops
Object.values(state.sounds).forEach(audio => {
    audio.loop = true;
    audio.preload = 'auto';
});

// --- User Authentication & API Fetch Helpers ---
async function apiFetch(path, options = {}) {
    const token = localStorage.getItem('lofi-study-token');
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers
    });
    if (!response.ok) {
        let errData;
        try {
            errData = await response.json();
        } catch (e) {
            errData = { message: '요청 처리에 실패했습니다.' };
        }
        throw new Error(errData.message || `API error: ${response.status}`);
    }
    if (response.status === 204) return null;
    return await response.json();
}

function updateAuthUI() {
    const userProfile = document.getElementById('user-profile');
    const displayUsername = document.getElementById('display-username');
    const loginOpenBtn = document.getElementById('btn-login-open');
    const adminViewBtn = document.getElementById('btn-admin-view');
    const adminPane = document.getElementById('tab-admin-dashboard');

    if (state.user) {
        if (loginOpenBtn) loginOpenBtn.style.display = 'none';
        if (userProfile) userProfile.style.display = 'flex';
        if (displayUsername) displayUsername.textContent = state.user.username;
        
        if (state.user.role === 'admin') {
            if (adminViewBtn) adminViewBtn.style.display = 'inline-block';
        } else {
            if (adminViewBtn) adminViewBtn.style.display = 'none';
            if (adminPane && adminPane.classList.contains('active')) {
                adminPane.classList.remove('active');
                document.getElementById('tab-focus-space').classList.add('active');
                document.getElementById('tab-btn-focus').classList.add('active');
            }
        }
    } else {
        if (userProfile) userProfile.style.display = 'none';
        if (loginOpenBtn) loginOpenBtn.style.display = 'inline-block';
        if (adminViewBtn) adminViewBtn.style.display = 'none';
        
        if (adminPane && adminPane.classList.contains('active')) {
            adminPane.classList.remove('active');
            document.getElementById('tab-focus-space').classList.add('active');
            document.getElementById('tab-btn-focus').classList.add('active');
        }
    }
}

function initAuth() {
    const token = localStorage.getItem('lofi-study-token');
    const savedUser = localStorage.getItem('lofi-study-user');
    if (token && savedUser) {
        try {
            state.user = JSON.parse(savedUser);
        } catch (e) {
            state.user = null;
            localStorage.removeItem('lofi-study-token');
            localStorage.removeItem('lofi-study-user');
        }
    }

    const loginOpenBtn = document.getElementById('btn-login-open');
    const loginCloseBtn = document.getElementById('btn-close-login');
    const loginOverlay = document.getElementById('login-overlay');
    const loginForm = document.getElementById('form-login');
    const logoutBtn = document.getElementById('btn-logout');

    let authMode = 'login';

    const setAuthMode = (mode) => {
        authMode = mode;
        const title = document.getElementById('login-title');
        const submitBtn = document.getElementById('btn-login-submit');
        const toggleText = document.getElementById('login-toggle-text');

        if (mode === 'register') {
            if (title) title.textContent = '회원가입';
            if (submitBtn) submitBtn.textContent = '회원가입';
            if (toggleText) {
                toggleText.innerHTML = `이미 계정이 있으신가요? <a href="#" id="btn-toggle-auth">로그인</a>`;
            }
        } else {
            if (title) title.textContent = '로그인';
            if (submitBtn) submitBtn.textContent = '로그인';
            if (toggleText) {
                toggleText.innerHTML = `계정이 없으신가요? <a href="#" id="btn-toggle-auth">회원가입</a>`;
            }
        }

        const newToggleBtn = document.getElementById('btn-toggle-auth');
        if (newToggleBtn) {
            newToggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                setAuthMode(authMode === 'login' ? 'register' : 'login');
            });
        }
    };

    if (loginOpenBtn) {
        loginOpenBtn.addEventListener('click', () => {
            if (loginOverlay) loginOverlay.classList.add('active');
            setAuthMode('login');
        });
    }

    if (loginCloseBtn) {
        loginCloseBtn.addEventListener('click', () => {
            if (loginOverlay) loginOverlay.classList.remove('active');
        });
    }

    if (loginOverlay) {
        loginOverlay.addEventListener('click', (e) => {
            if (e.target === loginOverlay) loginOverlay.classList.remove('active');
        });
    }

    const toggleAuthBtn = document.getElementById('btn-toggle-auth');
    if (toggleAuthBtn) {
        toggleAuthBtn.addEventListener('click', (e) => {
            e.preventDefault();
            setAuthMode(authMode === 'login' ? 'register' : 'login');
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const usernameInput = document.getElementById('login-username');
            const username = usernameInput ? usernameInput.value.trim() : '';
            const password = document.getElementById('login-password').value.trim();

            try {
                if (authMode === 'register') {
                    await apiFetch('/auth/register', {
                        method: 'POST',
                        body: JSON.stringify({ username, password })
                    });
                    alert('회원가입이 완료되었습니다. 로그인 해주세요.');
                    setAuthMode('login');
                    if (usernameInput) usernameInput.value = '';
                    document.getElementById('login-password').value = '';
                } else {
                    const data = await apiFetch('/auth/login', {
                        method: 'POST',
                        body: JSON.stringify({ username, password })
                    });
                    localStorage.setItem('lofi-study-token', data.token);
                    localStorage.setItem('lofi-study-user', JSON.stringify(data.user));
                    state.user = data.user;
                    
                    if (loginOverlay) loginOverlay.classList.remove('active');
                    loginForm.reset();
                    
                    updateAuthUI();
                    await initMemo();
                    await initStats();
                    await updateCalendarTab();
                }
            } catch (err) {
                alert(err.message || '인증 처리에 실패했습니다.');
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('lofi-study-token');
            localStorage.removeItem('lofi-study-user');
            state.user = null;
            
            updateAuthUI();
            initMemo();
            initStats();
            updateCalendarTab();

            const focusBtn = document.getElementById('tab-btn-focus');
            if (focusBtn) focusBtn.click();
        });
    }
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    initClock();
    initStats();
    initTabs();
    initTimer();
    initMixer();
    initPlayer();
    initMemo();
    initSettings();
    initUserSettings();
    initFocusMode();
    initBreathingGuide();
    initStretchReminder();
    initAdmin();
    initCalendar();
    
    updateGrowingPlantUI();
    updateAuthUI();
    updateCalendarTab();
});

// --- Admin Dashboard Logic ---
let currentEditUserId = null;
let allAdminUsers = [];
let allAdminSessions = [];
let allAdminMemos = [];
let allAdminLogs = [];

function initAdmin() {
    const adminBtn = document.getElementById('btn-admin-view');
    const adminCloseBtn = document.getElementById('btn-admin-close');
    const adminPane = document.getElementById('tab-admin-dashboard');
    
    const userDetailOverlay = document.getElementById('user-detail-overlay');
    const closeUserDetailBtn = document.getElementById('btn-close-user-detail');
    const editForm = document.getElementById('form-admin-edit-user');

    adminBtn.addEventListener('click', async () => {
        // Switch to admin tab logic
        const focusBtn = document.getElementById('tab-btn-focus');
        const statsBtn = document.getElementById('tab-btn-stats');
        const calendarBtn = document.getElementById('tab-btn-calendar');
        if (focusBtn) focusBtn.classList.remove('active');
        if (statsBtn) statsBtn.classList.remove('active');
        if (calendarBtn) calendarBtn.classList.remove('active');

        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        adminPane.classList.add('active');
        loadAdminData();
    });

    adminCloseBtn.addEventListener('click', () => {
        if (typeof window.switchTab === 'function') {
            window.switchTab('focus');
        } else {
            adminPane.classList.remove('active');
            document.getElementById('tab-focus-space').classList.add('active');
            const focusBtn = document.getElementById('tab-btn-focus');
            if (focusBtn) focusBtn.classList.add('active');
        }
    });

    // Close user detail modal
    if (closeUserDetailBtn) {
        closeUserDetailBtn.addEventListener('click', () => {
            userDetailOverlay.classList.remove('active');
        });
    }

    if (userDetailOverlay) {
        userDetailOverlay.addEventListener('click', (e) => {
            if (e.target === userDetailOverlay) {
                userDetailOverlay.classList.remove('active');
            }
        });
    }

    // Detail modal sub-tabs switching
    const detailTabBtns = document.querySelectorAll('.detail-tab-btn');
    const detailPanes = document.querySelectorAll('.detail-pane');

    detailTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            detailTabBtns.forEach(b => b.classList.remove('active'));
            detailPanes.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetPaneId = btn.dataset.detailPane;
            document.getElementById(targetPaneId).classList.add('active');
        });
    });

    // Form edit user
    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentEditUserId) return;

            const username = document.getElementById('admin-edit-username').value.trim();
            const email = document.getElementById('admin-edit-email').value.trim();

            try {
                await apiFetch(`/admin/users/${currentEditUserId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ username, email })
                });
                alert('사용자 정보가 성공적으로 수정되었습니다.');
                userDetailOverlay.classList.remove('active');
                
                // If editing currently logged in user's profile, update localStorage and state.user
                if (state.user && Number(state.user.id) === Number(currentEditUserId)) {
                    state.user.username = username;
                    localStorage.setItem('lofi-study-user', JSON.stringify(state.user));
                    updateAuthUI();
                }

                loadAdminData();
            } catch (err) {
                alert(err.message || '사용자 정보 수정에 실패했습니다.');
            }
        });
    }
}

async function loadAdminData() {
    try {
        const stats = await apiFetch('/admin/stats');
        document.getElementById('admin-total-users').textContent = stats.totalUsers;
        document.getElementById('admin-total-minutes').textContent = `${stats.totalStudyMinutes}분`;
        document.getElementById('admin-total-trees').textContent = stats.totalTreesPlanted;

        // Fetch all data once
        allAdminUsers = await apiFetch('/admin/users');
        allAdminSessions = await apiFetch('/admin/sessions');
        allAdminMemos = await apiFetch('/admin/memos');
        allAdminLogs = await apiFetch('/admin/logs');

        // Render Users Table
        const userTable = document.querySelector('#table-users tbody');
        userTable.innerHTML = allAdminUsers.map(u => `
            <tr>
                <td>${escapeHtml(u.username)}</td>
                <td>${escapeHtml(u.email)}</td>
                <td>${new Date(u.created_at).toLocaleDateString()}</td>
                <td>${u.role === 'admin' ? '👑 관리자' : '👤 일반'}</td>
                <td>
                    <button class="btn-detail-view" data-userid="${u.id}">상세조회</button>
                </td>
            </tr>
        `).join('');

        // Attach listeners for Detail View buttons
        const detailButtons = userTable.querySelectorAll('.btn-detail-view');
        detailButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const userId = btn.dataset.userid;
                openUserDetail(userId);
            });
        });

    } catch (err) {
        console.error('Admin data load failed:', err);
    }
}

function openUserDetail(userId) {
    const user = allAdminUsers.find(u => Number(u.id) === Number(userId));
    if (!user) return;

    currentEditUserId = userId;
    
    // Set form fields
    document.getElementById('admin-edit-username').value = user.username;
    document.getElementById('admin-edit-email').value = user.email;

    // Filter and populate sessions
    const sessions = allAdminSessions.filter(s => s.userId && Number(s.userId.id) === Number(userId));
    const sessionTable = document.querySelector('#table-user-detail-sessions tbody');
    sessionTable.innerHTML = sessions.length > 0 ? sessions.map(s => `
        <tr>
            <td>${new Date(s.start_time).toLocaleString()}</td>
            <td>${new Date(s.end_time).toLocaleString()}</td>
            <td>${s.duration}분</td>
            <td>${s.tree_planted || '-'}</td>
        </tr>
    `).join('') : `<tr><td colspan="4" style="text-align:center; color:var(--text-secondary); padding: 20px;">집중 기록이 없습니다.</td></tr>`;

    // Filter and populate memos
    const memos = allAdminMemos.filter(m => m.userId && Number(m.userId.id) === Number(userId));
    const memosTable = document.querySelector('#table-user-detail-memos tbody');
    memosTable.innerHTML = memos.length > 0 ? memos.map(m => `
        <tr>
            <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(m.content)}">${escapeHtml(m.content)}</td>
            <td>${new Date(m.created_at).toLocaleString()}</td>
            <td>${m.completed ? '✅ 완료' : '⏳ 진행중'}</td>
        </tr>
    `).join('') : `<tr><td colspan="3" style="text-align:center; color:var(--text-secondary); padding: 20px;">저장된 메모가 없습니다.</td></tr>`;

    // Filter and populate logs
    const logs = allAdminLogs.filter(l => l.userId && Number(l.userId.id) === Number(userId));
    const logTable = document.querySelector('#table-user-detail-logs tbody');
    logTable.innerHTML = logs.length > 0 ? logs.map(l => `
        <tr>
            <td>${new Date(l.login_time).toLocaleString()}</td>
            <td>${l.ip_address || '-'}</td>
        </tr>
    `).join('') : `<tr><td colspan="2" style="text-align:center; color:var(--text-secondary); padding: 20px;">접속 로그가 없습니다.</td></tr>`;

    // Reset sub-tab state inside modal (set first tab active)
    const firstTabBtn = document.querySelector('.detail-tab-btn');
    if (firstTabBtn) firstTabBtn.click();

    // Show modal
    document.getElementById('user-detail-overlay').classList.add('active');
}

// --- Tab Switcher ---
function initTabs() {
    const focusBtn = document.getElementById('tab-btn-focus');
    const statsBtn = document.getElementById('tab-btn-stats');
    const calendarBtn = document.getElementById('tab-btn-calendar');
    
    const focusPane = document.getElementById('tab-focus-space');
    const statsPane = document.getElementById('tab-garden-stats');
    const calendarPane = document.getElementById('tab-calendar-stats');
    const adminPane = document.getElementById('tab-admin-dashboard');

    const switchTab = (tabName) => {
        focusBtn.classList.remove('active');
        statsBtn.classList.remove('active');
        if (calendarBtn) calendarBtn.classList.remove('active');

        focusPane.classList.remove('active');
        statsPane.classList.remove('active');
        if (calendarPane) calendarPane.classList.remove('active');
        if (adminPane) adminPane.classList.remove('active');

        if (tabName === 'focus') {
            focusBtn.classList.add('active');
            focusPane.classList.add('active');
        } else if (tabName === 'stats') {
            statsBtn.classList.add('active');
            statsPane.classList.add('active');
            updateStatsTab(); // Reload statistics data
        } else if (tabName === 'calendar') {
            if (calendarBtn) calendarBtn.classList.add('active');
            if (calendarPane) calendarPane.classList.add('active');
            updateCalendarTab(); // Reload calendar data
        }
    };

    focusBtn.addEventListener('click', () => switchTab('focus'));
    statsBtn.addEventListener('click', () => switchTab('stats'));
    if (calendarBtn) {
        calendarBtn.addEventListener('click', () => switchTab('calendar'));
    }
    window.switchTab = switchTab;
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
                
                // 50분마다 알람/알림 발생 (타이머는 계속 진행)
                if (state.accumulatedTime > 0 && state.accumulatedTime % (50 * 60) === 0) {
                    playChimeSound();
                    if (state.stretchEnabled && typeof window.triggerStretchReminder === 'function') {
                        setTimeout(() => {
                            window.triggerStretchReminder(600);
                        }, 500);
                    } else {
                        setTimeout(() => {
                            alert("50분간 집중했습니다! 잠시 자리에서 일어나 스트레칭을 해주세요.");
                        }, 500);
                    }
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
                    const actualStudyTime = formatSecondsToHHMMSS(state.totalTime);
                    saveStudySession(focusMinutes, actualStudyTime);

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
                    audio.play().catch(err => console.log("Audio play blocked by browser policy until interaction: ", err));
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
        audio.preload = 'auto';
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
async function initMemo() {
    const input = document.getElementById('input-todo');
    const addBtn = document.getElementById('btn-todo-add');
    const todoListEl = document.getElementById('todo-list');

    let todos = [];

    const renderMemos = (memosList) => {
        todoListEl.innerHTML = '';
        memosList.forEach((todo) => {
            const li = document.createElement('li');
            li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
            
            li.innerHTML = `
                <div class="todo-text-wrapper">
                    <span class="material-symbols-rounded todo-checkbox">
                        ${todo.completed ? 'check_box' : 'check_box_outline_blank'}
                    </span>
                    <span class="todo-text">${escapeHtml(todo.content || todo.text)}</span>
                </div>
                <button class="todo-delete-btn" title="삭제">
                    <span class="material-symbols-rounded">delete</span>
                </button>
            `;

            li.querySelector('.todo-text-wrapper').addEventListener('click', async () => {
                if (state.user) {
                    try {
                        await apiFetch(`/memos/${todo.id}`, {
                            method: 'PUT',
                            body: JSON.stringify({ completed: !todo.completed })
                        });
                        initMemo();
                    } catch (e) { console.error(e); }
                } else {
                    todo.completed = !todo.completed;
                    localStorage.setItem('study-space-todos', JSON.stringify(todos));
                    renderMemos(todos);
                }
            });

            li.querySelector('.todo-delete-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                if (state.user) {
                    try {
                        await apiFetch(`/memos/${todo.id}`, { method: 'DELETE' });
                        initMemo();
                    } catch (e) { console.error(e); }
                } else {
                    const idx = todos.findIndex(t => t.id === todo.id || t.text === todo.text);
                    if (idx !== -1) {
                        todos.splice(idx, 1);
                        localStorage.setItem('study-space-todos', JSON.stringify(todos));
                        renderMemos(todos);
                    }
                }
            });

            todoListEl.appendChild(li);
        });
    };

    if (state.user) {
        try {
            todos = await apiFetch('/memos');
            renderMemos(todos);
        } catch (e) { console.error(e); }
    } else {
        const saved = localStorage.getItem('study-space-todos');
        if (saved) {
            try {
                todos = JSON.parse(saved);
            } catch (e) {
                todos = [];
            }
        }
        renderMemos(todos);
    }

    const addTodo = async () => {
        const currentInput = document.getElementById('input-todo');
        const text = currentInput ? currentInput.value.trim() : '';
        if (!text) return;

        if (state.user) {
            try {
                await apiFetch('/memos', {
                    method: 'POST',
                    body: JSON.stringify({ content: text })
                });
                if (currentInput) currentInput.value = '';
                initMemo();
            } catch (e) { console.error(e); }
        } else {
            todos.push({
                id: Date.now(),
                text: text,
                completed: false
            });
            if (currentInput) currentInput.value = '';
            localStorage.setItem('study-space-todos', JSON.stringify(todos));
            renderMemos(todos);
        }
    };

    // Remove previous onclick/keypress listeners to prevent duplicate bindings
    const newAddBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newAddBtn, addBtn);
    newAddBtn.addEventListener('click', addTodo);

    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    newInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTodo();
    });
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
async function initStats() {
    if (state.user) {
        try {
            const sessions = await apiFetch('/sessions');
            const todayStr = new Date().toDateString();
            
            const todaySessions = sessions.filter(s => new Date(s.end_time || s.startTime).toDateString() === todayStr);
            state.dailyFocusTime = todaySessions.reduce((acc, s) => acc + Number(s.duration || 0), 0);
            
            // 1시간당 나무 1개 동적 계산
            state.treesPlantedCount = Math.floor(state.dailyFocusTime / 60);
            state.plantedTrees = Array(state.treesPlantedCount).fill('🌳');
            state.accumulatedTime = (state.dailyFocusTime % 60) * 60; // 화분 성장 상태 동기화
            
            updateGrowingPlantUI();
            updateStatsTab();
        } catch (e) {
            console.error('Failed to load stats from server:', e);
        }
    } else {
        const todayStr = new Date().toISOString().split('T')[0];
        const lastDay = localStorage.getItem('study-space-last-day');
        
        if (lastDay !== todayStr) {
            localStorage.setItem('study-space-daily-focus', '0');
            localStorage.setItem('study-space-planted-trees', '[]');
            localStorage.setItem('study-space-sessions', '[]');
            localStorage.setItem('study-space-last-day', todayStr);
            
            state.dailyFocusTime = 0;
            state.plantedTrees = [];
            state.sessionHistory = [];
            state.accumulatedTime = 0;
        } else {
            state.dailyFocusTime = parseInt(localStorage.getItem('study-space-daily-focus')) || 0;
            // 1시간당 나무 1개 동적 계산
            state.treesPlantedCount = Math.floor(state.dailyFocusTime / 60);
            state.plantedTrees = Array(state.treesPlantedCount).fill('🌳');
            state.accumulatedTime = (state.dailyFocusTime % 60) * 60; // 화분 성장 상태 동기화
            
            try {
                state.sessionHistory = JSON.parse(localStorage.getItem('study-space-sessions')) || [];
            } catch(e) {
                state.sessionHistory = [];
            }
        }
        updateGrowingPlantUI();
        updateStatsTab();
    }
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

function getTreeStageInfo(seconds) {
    const cycleSeconds = seconds % 3600;
    const minutes = Math.floor(cycleSeconds / 60);
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
    
    const stageSeconds = cycleSeconds - (currentStageTime * 60);
    const stageProgressPercent = Math.min(100, Math.round((stageSeconds / 600) * 100));

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

// --- STUDY CALENDAR & STATS COMPARISON LOGIC ---
let currentCalendarDate = new Date();
let userSessions = [];
let userMemos = [];

function initCalendar() {
    const prevBtn = document.getElementById('btn-calendar-prev');
    const nextBtn = document.getElementById('btn-calendar-next');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
            renderCalendar();
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
            renderCalendar();
        });
    }
}

async function updateCalendarTab() {
    if (!state.user) {
        // 비로그인 상태일 때 로컬 세션 및 메모 데이터를 연동해 캘린더가 동작하도록 처리
        try {
            const savedSessions = localStorage.getItem('study-space-sessions');
            const localSessions = savedSessions ? JSON.parse(savedSessions) : [];
            const todayStr = new Date().toISOString().split('T')[0];
            
            userSessions = localSessions.map(s => {
                const timeParts = s.time && s.time.includes(':') ? s.time : '00:00';
                return {
                    duration: s.duration || 0,
                    tree_planted: s.tree || '',
                    start_time: s.start_time || `${todayStr}T${timeParts}:00.000Z`,
                    end_time: s.end_time || `${todayStr}T${timeParts}:00.000Z`
                };
            });
        } catch (e) {
            userSessions = [];
        }

        try {
            userMemos = JSON.parse(localStorage.getItem('study-space-todos')) || [];
        } catch (e) {
            userMemos = [];
        }

        renderCalendar();
        calculateComparisonStats();
        
        const detailsContent = document.getElementById('calendar-daily-details-content');
        if (detailsContent) {
            detailsContent.innerHTML = `
                <p class="select-hint-text" style="color: var(--accent-glow); margin-bottom: 8px;">※ 현재 비로그인 상태(오프라인 모드)입니다.</p>
                <p class="select-hint-text">로그인하시면 클라우드에 연동된 개인 학습 달력과 상세 통계를 확인하실 수 있습니다.</p>
            `;
        }
        document.getElementById('comparison-mom-indicator').textContent = '오프라인 모드';
        document.getElementById('comparison-dod-indicator').textContent = '오프라인 모드';
        return;
    }

    try {
        userSessions = await apiFetch('/sessions');
        userMemos = await apiFetch('/memos');
    } catch (e) {
        console.error('Failed to update calendar tab from API, falling back to local data:', e);
        try {
            const savedSessions = localStorage.getItem('study-space-sessions');
            const localSessions = savedSessions ? JSON.parse(savedSessions) : [];
            const todayStr = new Date().toISOString().split('T')[0];
            
            userSessions = localSessions.map(s => {
                const timeParts = s.time && s.time.includes(':') ? s.time : '00:00';
                return {
                    duration: s.duration || 0,
                    tree_planted: s.tree || '',
                    start_time: s.start_time || `${todayStr}T${timeParts}:00.000Z`,
                    end_time: s.end_time || `${todayStr}T${timeParts}:00.000Z`
                };
            });
        } catch (err) {
            userSessions = [];
        }

        try {
            userMemos = JSON.parse(localStorage.getItem('study-space-todos')) || [];
        } catch (err) {
            userMemos = [];
        }
    }

    renderCalendar();
    calculateComparisonStats();
}

function renderCalendar() {
    const calendarGrid = document.getElementById('calendar-days-grid');
    const label = document.getElementById('calendar-month-year-label');
    
    if (!calendarGrid || !label) return;
    
    calendarGrid.innerHTML = '';
    
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    
    label.textContent = `${year}년 ${String(month + 1).padStart(2, '0')}월`;
    
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevTotalDays = new Date(year, month, 0).getDate();
    
    // Previous month's trailing days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
        const dayNum = prevTotalDays - i;
        const cellDate = new Date(year, month - 1, dayNum);
        createDayCell(dayNum, cellDate, true);
    }
    
    // Current month days
    for (let i = 1; i <= totalDays; i++) {
        const cellDate = new Date(year, month, i);
        createDayCell(i, cellDate, false);
    }
    
    // Next month's leading days
    const totalCellsRendered = firstDayIndex + totalDays;
    const remainingCells = 42 - totalCellsRendered;
    for (let i = 1; i <= remainingCells; i++) {
        const cellDate = new Date(year, month + 1, i);
        createDayCell(i, cellDate, true);
    }
}

function createDayCell(dayNum, date, isOtherMonth) {
    const calendarGrid = document.getElementById('calendar-days-grid');
    const cell = document.createElement('div');
    cell.className = 'calendar-day-cell';
    if (isOtherMonth) cell.classList.add('other-month');
    
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
        cell.classList.add('today');
    }
    
    const daySessions = userSessions.filter(s => new Date(s.end_time || s.start_time || s.startTime).toDateString() === date.toDateString());
    const dayMemos = userMemos.filter(m => new Date(m.created_at).toDateString() === date.toDateString());
    
    const totalMinutes = daySessions.reduce((acc, s) => acc + Number(s.duration || 0), 0);
    
    if (totalMinutes > 0) {
        cell.classList.add('has-session');
        const treeCount = Math.floor(totalMinutes / 60);
        
        const infoDiv = document.createElement('div');
        infoDiv.className = 'day-session-info';
        infoDiv.innerHTML = `<span class="focus-time">${totalMinutes}분</span> <span class="focus-icon">나무 X ${treeCount}</span>`;
        cell.appendChild(infoDiv);
    }
    
    const numSpan = document.createElement('span');
    numSpan.className = 'day-number';
    numSpan.textContent = dayNum;
    cell.appendChild(numSpan);
    
    cell.addEventListener('click', () => {
        document.querySelectorAll('.calendar-day-cell').forEach(c => c.classList.remove('active-selected'));
        cell.classList.add('active-selected');
        showDayDetails(date, daySessions, dayMemos);
    });
    
    calendarGrid.appendChild(cell);
}

function showDayDetails(date, sessions, memos) {
    const label = document.getElementById('calendar-details-date-label');
    const content = document.getElementById('calendar-daily-details-content');
    
    if (!label || !content) return;
    
    const formattedDate = `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 상세 기록`;
    label.textContent = formattedDate;
    
    const totalMinutes = sessions.reduce((acc, s) => acc + Number(s.duration || 0), 0);
    const treeCount = Math.floor(totalMinutes / 60);
    const trees = Array(treeCount).fill('🌳');
    
    let memosHTML = '';
    if (memos.length > 0) {
        memosHTML = `<ul class="detail-memos-list">` + memos.map(m => `
            <li class="detail-memo-li ${m.completed ? 'completed' : ''}">
                <span class="material-symbols-rounded">${m.completed ? 'check_box' : 'check_box_outline_blank'}</span>
                <span>${escapeHtml(m.content)}</span>
            </li>
        `).join('') + `</ul>`;
    } else {
        memosHTML = `<p style="font-size: 0.85rem; color: var(--text-secondary);">기록된 메모가 없습니다.</p>`;
    }
    
    content.innerHTML = `
        <div class="detail-item-section">
            <h4>집중 시간</h4>
            <div class="detail-item-value font-mono">${totalMinutes}분</div>
        </div>
        <div class="detail-item-section">
            <h4>심고 가꾼 나무 (${treeCount}그루)</h4>
            <div class="detail-trees-wrapper">
                ${treeCount > 0 ? trees.join(' ') : '<span style="font-size: 0.85rem; color: var(--text-secondary);">심은 나무 없음</span>'}
            </div>
        </div>
        <div class="detail-item-section">
            <h4>오늘 등록한 메모</h4>
            ${memosHTML}
        </div>
    `;
}

function calculateComparisonStats() {
    const now = new Date();
    const todayStr = now.toDateString();
    
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();
    
    let todayMinutes = 0;
    let yesterdayMinutes = 0;
    
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDay = now.getDate();
    
    let prevYear = currentYear;
    let prevMonth = currentMonth - 1;
    if (prevMonth < 0) {
        prevMonth = 11;
        prevYear -= 1;
    }
    
    let currentMonthTotal = 0;
    let prevMonthTotal = 0;
    
    userSessions.forEach(s => {
        const sessionDate = new Date(s.end_time || s.start_time || s.startTime);
        const sYear = sessionDate.getFullYear();
        const sMonth = sessionDate.getMonth();
        const sDay = sessionDate.getDate();
        const sDateStr = sessionDate.toDateString();
        
        const duration = Number(s.duration || 0);
        
        if (sDateStr === todayStr) {
            todayMinutes += duration;
        } else if (sDateStr === yesterdayStr) {
            yesterdayMinutes += duration;
        }
        
        if (sYear === currentYear && sMonth === currentMonth && sDay <= currentDay) {
            currentMonthTotal += duration;
        }
        if (sYear === prevYear && sMonth === prevMonth && sDay <= currentDay) {
            prevMonthTotal += duration;
        }
    });
    
    const dodValueEl = document.getElementById('comparison-dod-value');
    const dodIndicatorEl = document.getElementById('comparison-dod-indicator');
    
    if (dodValueEl && dodIndicatorEl) {
        dodValueEl.textContent = `${todayMinutes}분`;
        const dodDiff = todayMinutes - yesterdayMinutes;
        if (dodDiff > 0) {
            dodIndicatorEl.className = 'comparison-indicator indicator-positive';
            dodIndicatorEl.innerHTML = `<span class="material-symbols-rounded">arrow_upward</span>어제보다 ${dodDiff}분 더 집중함`;
        } else if (dodDiff < 0) {
            dodIndicatorEl.className = 'comparison-indicator indicator-negative';
            dodIndicatorEl.innerHTML = `<span class="material-symbols-rounded">arrow_downward</span>어제보다 ${Math.abs(dodDiff)}분 덜 집중함`;
        } else {
            dodIndicatorEl.className = 'comparison-indicator indicator-neutral';
            dodIndicatorEl.innerHTML = `<span class="material-symbols-rounded">horizontal_rule</span>어제와 동일함`;
        }
    }
    
    const momValueEl = document.getElementById('comparison-mom-value');
    const momIndicatorEl = document.getElementById('comparison-mom-indicator');
    
    if (momValueEl && momIndicatorEl) {
        momValueEl.textContent = `${currentMonthTotal}분`;
        const momDiff = currentMonthTotal - prevMonthTotal;
        if (momDiff > 0) {
            momIndicatorEl.className = 'comparison-indicator indicator-positive';
            momIndicatorEl.innerHTML = `<span class="material-symbols-rounded">arrow_upward</span>지난달 동기 대비 ${momDiff}분 증가`;
        } else if (momDiff < 0) {
            momIndicatorEl.className = 'comparison-indicator indicator-negative';
            momIndicatorEl.innerHTML = `<span class="material-symbols-rounded">arrow_downward</span>지난달 동기 대비 ${Math.abs(momDiff)}분 감소`;
        } else {
            momIndicatorEl.className = 'comparison-indicator indicator-neutral';
            momIndicatorEl.innerHTML = `<span class="material-symbols-rounded">horizontal_rule</span>지난달 동기와 동일함`;
        }
    }
}

async function saveStudySession(duration, treePlanted) {
    if (state.user) {
        try {
            await apiFetch('/sessions', {
                method: 'POST',
                body: JSON.stringify({
                    duration,
                    treePlanted,
                    startTime: new Date(Date.now() - duration * 60 * 1000).toISOString()
                })
            });
            await initStats();
        } catch (e) {
            console.error('Failed to save study session:', e);
        }
    } else {
        state.dailyFocusTime += duration;
        localStorage.setItem('study-space-daily-focus', String(state.dailyFocusTime));
        
        // 1시간당 나무 1그루 계산하여 상태 갱신
        state.treesPlantedCount = Math.floor(state.dailyFocusTime / 60);
        state.plantedTrees = Array(state.treesPlantedCount).fill('🌳');
        localStorage.setItem('study-space-planted-trees', JSON.stringify(state.plantedTrees));
        
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        state.sessionHistory.unshift({
            time: timeStr,
            duration: duration,
            tree: treePlanted
        });
        localStorage.setItem('study-space-sessions', JSON.stringify(state.sessionHistory));
        updateStatsTab();
    }
}

function initUserSettings() {
    const settingsBtn = document.getElementById('btn-user-settings');
    const settingsOverlay = document.getElementById('user-settings-overlay');
    const closeSettingsBtn = document.getElementById('btn-close-user-settings');
    const changePwdForm = document.getElementById('form-change-password');

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            if (settingsOverlay) {
                settingsOverlay.classList.add('active');
            }
        });
    }

    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', () => {
            if (settingsOverlay) {
                settingsOverlay.classList.remove('active');
                if (changePwdForm) changePwdForm.reset();
            }
        });
    }

    if (settingsOverlay) {
        settingsOverlay.addEventListener('click', (e) => {
            if (e.target === settingsOverlay) {
                settingsOverlay.classList.remove('active');
                if (changePwdForm) changePwdForm.reset();
            }
        });
    }

    if (changePwdForm) {
        changePwdForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const currentPassword = document.getElementById('change-pwd-current').value.trim();
            const newPassword = document.getElementById('change-pwd-new').value.trim();
            const confirmPassword = document.getElementById('change-pwd-confirm').value.trim();

            if (newPassword !== confirmPassword) {
                alert('새 비밀번호와 비밀번호 확인이 일치하지 않습니다.');
                return;
            }

            try {
                const response = await apiFetch('/auth/change-password', {
                    method: 'POST',
                    body: JSON.stringify({ currentPassword, newPassword })
                });

                alert(response.message || '비밀번호가 성공적으로 변경되었습니다.');
                settingsOverlay.classList.remove('active');
                changePwdForm.reset();
            } catch (err) {
                alert(err.message || '비밀번호 변경에 실패했습니다.');
            }
        });
    }
}
