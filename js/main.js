/* ==================== PRELOADER ==================== */
const preloader = document.getElementById('preloader');
if (preloader) {
    const progress = document.querySelector('.preloader-progress');
    let loadProgress = 0;
    document.body.style.overflow = 'hidden';

    const preloaderInterval = setInterval(() => {
        loadProgress += Math.random() * 15 + 5;
        if (loadProgress >= 100) {
            loadProgress = 100;
            clearInterval(preloaderInterval);
            setTimeout(() => {
                preloader.classList.add('hidden');
                document.body.style.overflow = 'auto';
                if (document.querySelector('.hero-title')) {
                    initHeroAnimation();
                }
            }, 400);
        }
        progress.style.width = loadProgress + '%';
    }, 200);
} else {
    if (document.querySelector('.hero-title')) {
        initHeroAnimation();
    }
}

/* ==================== STICKY HEADER ==================== */
const header = document.getElementById('header');

if (header) {
    window.addEventListener('scroll', () => {
        if (window.scrollY > 80) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });
}

/* ==================== HERO TEXT ANIMATION ==================== */
function initHeroAnimation() {
    const title = document.querySelector('.hero-title');
    const html = title.innerHTML;
    const parts = html.split(/<br\s*\/?>/i);
    title.innerHTML = '';

    let wordIndex = 0;
    parts.forEach((line, lineIdx) => {
        const words = line.trim().split(/\s+/);
        words.forEach((word) => {
            if (!word) return;
            const span = document.createElement('span');
            span.classList.add('word');
            span.textContent = word;
            span.style.transitionDelay = (wordIndex * 0.08) + 's';
            title.appendChild(span);
            wordIndex++;
        });
        if (lineIdx < parts.length - 1) {
            title.appendChild(document.createElement('br'));
        }
    });

    setTimeout(() => {
        document.querySelectorAll('.hero-title .word').forEach(w => w.classList.add('visible'));
    }, 200);

    setTimeout(() => {
        const heroButtons = document.querySelector('.hero-buttons');
        if (heroButtons) heroButtons.classList.add('visible');
    }, 600);
}

/* ==================== HERO SCROLL EFFECT ==================== */
const heroSection = document.querySelector('.hero');
if (heroSection) {
    const heroContent = document.querySelector('.hero-content');
    const heroOverlay = document.querySelector('.hero-overlay');

    window.addEventListener('scroll', () => {
        const scrollY = window.scrollY;
        const heroHeight = heroSection.offsetHeight;
        if (scrollY < heroHeight) {
            const progress = scrollY / heroHeight;
            heroContent.style.transform = `translateY(${scrollY * 0.3}px)`;
            heroContent.style.opacity = 1 - progress * 1.5;
            heroOverlay.style.background = `linear-gradient(90deg,
                rgba(30,37,48,${0.93 + progress * 0.07}) 0%,
                rgba(30,37,48,${0.8 + progress * 0.2}) 30%,
                rgba(30,37,48,${0.6 + progress * 0.4}) 55%,
                rgba(30,37,48,${0.33 + progress * 0.67}) 100%)`;
        }
    });
}

/* ==================== HERO INTRO (instant on load) ==================== */
document.querySelectorAll('.hero-intro').forEach(el => {
    const delay = parseInt(el.dataset.introDelay) || 0;
    setTimeout(() => el.classList.add('hero-visible'), delay);
});

/* ==================== PAGE HERO PARALLAX ==================== */
const pageHeroBg = document.querySelector('.page-hero__bg');
if (pageHeroBg) {
    window.addEventListener('scroll', () => {
        const scrollY = window.scrollY;
        if (scrollY < 600) {
            pageHeroBg.style.transform = `translateY(${scrollY * 0.35}px) scale(1.1)`;
        }
    }, { passive: true });
    pageHeroBg.style.transform = 'scale(1.1)';
}

/* ==================== SCROLL ANIMATIONS ==================== */
const animatedElements = document.querySelectorAll('[data-animate]');

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const delay = entry.target.dataset.delay || 0;
            setTimeout(() => {
                entry.target.classList.add('animated');
            }, parseInt(delay));
            observer.unobserve(entry.target);
        }
    });
}, {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
});

animatedElements.forEach(el => observer.observe(el));

/* ==================== COUNTER ANIMATION ==================== */
function animateCounter(el) {
    const target = parseInt(el.dataset.count);
    const duration = Math.min(800 + target * 8, 2000);
    const start = performance.now();

    function update(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        el.textContent = Math.floor(target * eased);

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            el.textContent = target;
        }
    }

    requestAnimationFrame(update);
}

const counters = document.querySelectorAll('[data-count]');
const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            animateCounter(entry.target);
            counterObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.5 });

counters.forEach(c => counterObserver.observe(c));

/* ==================== MARQUEE DUPLICATION ==================== */
const marqueeTrack = document.querySelector('.marquee-track');
if (marqueeTrack) {
    const slides = marqueeTrack.innerHTML;
    marqueeTrack.innerHTML = slides + slides;
}

/* ==================== SMOOTH SCROLL ==================== */
document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(link.getAttribute('href'));
        if (target) {
            const headerHeight = 80;
            const top = target.getBoundingClientRect().top + window.scrollY - headerHeight;
            window.scrollTo({ top, behavior: 'smooth' });
        }
    });
});

/* ==================== CITY TAGS HOVER ==================== */
const cityTags = document.querySelectorAll('.city-tag');
const mapGlows = document.querySelectorAll('.map-glow');

cityTags.forEach(tag => {
    const city = tag.dataset.city;

    tag.addEventListener('mouseenter', () => {
        mapGlows.forEach(g => g.classList.remove('is-highlighted'));
        const glow = document.querySelector(`.map-glow[data-city="${city}"]`);
        if (glow) glow.classList.add('is-highlighted');
        tag.classList.add('is-active');
    });

    tag.addEventListener('mouseleave', () => {
        mapGlows.forEach(g => g.classList.remove('is-highlighted'));
        tag.classList.remove('is-active');
    });

    tag.addEventListener('click', () => {
        cityTags.forEach(t => t.classList.remove('is-active'));
        tag.classList.add('is-active');
        mapGlows.forEach(g => g.classList.remove('is-highlighted'));
        const glow = document.querySelector(`.map-glow[data-city="${city}"]`);
        if (glow) glow.classList.add('is-highlighted');
    });
});

mapGlows.forEach(glow => {
    const city = glow.dataset.city;

    glow.addEventListener('mouseenter', () => {
        glow.classList.add('is-highlighted');
        const tag = document.querySelector(`.city-tag[data-city="${city}"]`);
        if (tag) tag.classList.add('is-active');
    });

    glow.addEventListener('mouseleave', () => {
        glow.classList.remove('is-highlighted');
        const tag = document.querySelector(`.city-tag[data-city="${city}"]`);
        if (tag) tag.classList.remove('is-active');
    });
});

/* ==================== HERO VIDEO AUTOPLAY ==================== */
const heroVideo = document.getElementById('hero-video');
if (heroVideo) {
    heroVideo.play().catch(() => {
        document.addEventListener('click', () => heroVideo.play(), { once: true });
    });
}

/* ==================== CERT CAROUSEL (marquee) ==================== */
(() => {
    const track = document.querySelector('.cert-carousel__track');
    if (!track) return;
    const cards = Array.from(track.children);
    cards.forEach(card => {
        const clone = card.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        clone.setAttribute('tabindex', '-1');
        track.appendChild(clone);
    });
})();

/* ==================== PARTNERS FILTER ==================== */
const filterTabs = document.querySelectorAll('.partners-filters__tab[data-filter]');
const partnerCards = document.querySelectorAll('.partner-card[data-category]');

if (filterTabs.length && partnerCards.length) {
    filterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            filterTabs.forEach(t => t.classList.remove('partners-filters__tab--active'));
            tab.classList.add('partners-filters__tab--active');

            const filter = tab.dataset.filter;

            partnerCards.forEach(card => {
                if (filter === 'all' || card.dataset.category === filter) {
                    card.classList.remove('partner-card--hidden');
                    card.classList.add('partner-card--visible');
                } else {
                    card.classList.remove('partner-card--visible');
                    card.classList.add('partner-card--hidden');
                }
            });
        });
    });
}


/* ==================== LUCIDE ICONS ==================== */
if (typeof lucide !== 'undefined') {
    lucide.createIcons();
}
