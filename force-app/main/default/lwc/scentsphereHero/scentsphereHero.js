
import { LightningElement } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import heroImage from '@salesforce/resourceUrl/ScentSphereHeroBg1';

export default class ScentsphereHero extends NavigationMixin(LightningElement) {

    heroImage = heroImage;

    viewportObserver;
    resizeHandler;

    connectedCallback() {
        this.updateViewportWidth();

        this.resizeHandler = () => this.updateViewportWidth();
        window.addEventListener('resize', this.resizeHandler);

        // Watch page width when scrollbar appears
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
    }

    disconnectedCallback() {
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
        }

        if (this.viewportObserver) {
            this.viewportObserver.disconnect();
        }
    }

    // Update hero viewport width
    updateViewportWidth() {
        try {
            const width = document.documentElement.clientWidth;

            if (width) {
                this.template.host.style.setProperty(
                    '--hero-vw',
                    `${width}px`
                );
            }
        } catch (error) {
            // CSS fallback: 100vw
        }
    }

    // Common Navigation Method
    navigateToPage(pageName) {
        this[NavigationMixin.Navigate]({
            type: 'comm__namedPage',
            attributes: {
                name: pageName
            }
        });
    }

    // Shop Button
    handleShop(event) {
        event.preventDefault();
        this.navigateToPage('Shop__c');
    }

    // Collections Button
    handleCollections(event) {
        event.preventDefault();
        this.navigateToPage('Collections__c');
    }
}
