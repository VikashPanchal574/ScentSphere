import { LightningElement } from 'lwc';
import heroImage from '@salesforce/resourceUrl/ScentSphereHero';
import heroImage2 from '@salesforce/resourceUrl/ScentSphereHero2';
import heroImage3 from '@salesforce/resourceUrl/ScentSphereHero3';

const AUTOPLAY_DELAY = 5500;

export default class ScentsphereHero extends LightningElement {

    currentIndex = 0;
    previousIndex = -1;

    // Two or more slides turn on the carousel (arrows, dots, autoplay).
    // Edit the alt, eyebrow, title and subtitle of slides 2 and 3 to match your images.
    slides = [
        {
            image: heroImage,
            alt: 'Luxury ScentSphere perfume bottle with elegant floral arrangement',
            eyebrow: 'DISCOVER YOUR SIGNATURE',
            title: 'The Scent of Elegance',
            subtitle: 'Discover something extraordinary.'
        },
        {
            image: heroImage2,
            alt: 'ScentSphere perfume bottle, second featured fragrance',
            eyebrow: 'EVENING EDITION',
            title: 'Midnight Oud',
            subtitle: 'Smoked wood, warm amber and a lingering trail.'
        },
        {
            image: heroImage3,
            alt: 'ScentSphere perfume bottle, third featured fragrance',
            eyebrow: 'FLORAL EDITION',
            title: 'Rose Absolue',
            subtitle: 'Velvet petals and a soft, powdery finish.'
        }
    ];

    autoplayTimer;
    isPaused = false;
    viewportObserver;
    resizeHandler;

    /* =====================================
       GETTERS
       ===================================== */

    get hasMultipleSlides() {
        return this.slides.length > 1;
    }

    get containerClass() {
        return this.hasMultipleSlides
            ? 'hero-image-container has-controls'
            : 'hero-image-container';
    }

    get slideItems() {
        return this.slides.map((slide, index) => {
            const isActive = index === this.currentIndex;
            const isLeaving = index === this.previousIndex;

            let className = 'hero-slide';
            if (isActive) {
                className += ' is-active';
            } else if (isLeaving) {
                className += ' is-leaving';
            }

            return {
                ...slide,
                index,
                id: `slide-${index}`,
                className,
                ariaHidden: isActive ? 'false' : 'true',
                dotClass: isActive ? 'hero-dot is-active' : 'hero-dot',
                dotLabel: `Show ${slide.title}`
            };
        });
    }

    /* =====================================
       LIFECYCLE
       ===================================== */

    connectedCallback() {
        this.updateViewportWidth();

        this.resizeHandler = () => this.updateViewportWidth();
        window.addEventListener('resize', this.resizeHandler);

        // The page scrollbar can appear after the hero renders (when the rest of
        // the page loads), so watch the page width as well as window resizes.
        try {
            if (window.ResizeObserver) {
                this.viewportObserver = new window.ResizeObserver(() => {
                    this.updateViewportWidth();
                });
                this.viewportObserver.observe(document.documentElement);
            }
        } catch (error) {
            this.viewportObserver = undefined;
        }

        this.startAutoplay();
    }

    disconnectedCallback() {
        this.stopAutoplay();

        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
        }
        if (this.viewportObserver) {
            this.viewportObserver.disconnect();
        }
    }

    /* =====================================
       FULL-WIDTH FIX
       The hero uses width: 100vw to break out of the page container.
       100vw includes the vertical scrollbar, which is what caused the
       horizontal scrollbar. clientWidth excludes it.
       ===================================== */

    updateViewportWidth() {
        try {
            const width = document.documentElement.clientWidth;
            if (width) {
                this.template.host.style.setProperty('--hero-vw', `${width}px`);
            }
        } catch (error) {
            // If the width cannot be read, the CSS falls back to 100vw.
        }
    }

    /* =====================================
       CAROUSEL
       ===================================== */

    goTo(index) {
        const total = this.slides.length;
        const next = (index + total) % total;

        if (next !== this.currentIndex) {
            this.previousIndex = this.currentIndex;
            this.currentIndex = next;
        }
        this.startAutoplay();
    }

    startAutoplay() {
        this.stopAutoplay();

        if (!this.hasMultipleSlides || this.isPaused || this.prefersReducedMotion()) {
            return;
        }

        this.autoplayTimer = window.setTimeout(() => {
            this.goTo(this.currentIndex + 1);
        }, AUTOPLAY_DELAY);
    }

    stopAutoplay() {
        if (this.autoplayTimer) {
            window.clearTimeout(this.autoplayTimer);
            this.autoplayTimer = undefined;
        }
    }

    prefersReducedMotion() {
        return Boolean(
            window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
        );
    }

    handlePrev() {
        this.goTo(this.currentIndex - 1);
    }

    handleNext() {
        this.goTo(this.currentIndex + 1);
    }

    handleDot(event) {
        this.goTo(Number(event.currentTarget.dataset.index));
    }

    handlePause() {
        this.isPaused = true;
        this.stopAutoplay();
    }

    handleResume() {
        this.isPaused = false;
        this.startAutoplay();
    }

    /* =====================================
       BUTTON HANDLERS (unchanged)
       ===================================== */

    handleShopNow() {
        console.log('Shop Now clicked');
    }

    handleExplore() {
        console.log('Explore Collections clicked');
    }
}