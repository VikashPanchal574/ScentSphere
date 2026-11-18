
import { LightningElement, wire } from 'lwc';

import {
    NavigationMixin,
    CurrentPageReference
} from 'lightning/navigation';

import getFeaturedPerfumes
    from '@salesforce/apex/FeaturedFragrancesController.getFeaturedPerfumes';

export default class FeaturedFragrances extends NavigationMixin(LightningElement) {

    products = [];
    isLoading = true;
    errorMessage = '';

    showAllProducts = false;

    // NEW: Return from Product Details to Featured section
    shouldScrollToFeatured = false;
    hasScrolledToFeatured = false;

    // ==========================================
    // HOME PAGE RETURN CONTEXT
    // ==========================================

    @wire(CurrentPageReference)
    handleHomePageReference(pageReference) {

        if (!pageReference) {
            return;
        }

        const scrollRequested =
            pageReference.state?.c__scrollTo === 'featured';

        this.shouldScrollToFeatured = scrollRequested;

        if (scrollRequested) {
            this.scrollToFeaturedSection();
        } else {
            this.hasScrolledToFeatured = false;
        }
    }

    renderedCallback() {
        this.scrollToFeaturedSection();
    }

    scrollToFeaturedSection() {

        if (
            !this.shouldScrollToFeatured ||
            this.hasScrolledToFeatured
        ) {
            return;
        }

        const featuredSection = this.template.querySelector(
            '.featured-section'
        );

        if (!featuredSection) {
            return;
        }

        this.hasScrolledToFeatured = true;

        featuredSection.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }

    // ==========================================
    // FORMAT PRODUCTS WITH STOCK STATUS
    // ==========================================

    formatProducts(data) {

        return data.map(perfume => {

            const stockQuantity = Number(
                perfume.stockQuantity ?? 0
            );

            return {
                ...perfume,

                imageUrl: perfume.imageUrl || '',

                stockQuantity,

                // Detect Out of Stock
                isOutOfStock: stockQuantity <= 0,

                formattedPrice: new Intl.NumberFormat('en-IN', {
                    style: 'currency',
                    currency: 'INR',
                    maximumFractionDigits: 0
                }).format(perfume.price || 0)
            };
        });
    }

    // ==========================================
    // FETCH FEATURED PERFUMES
    // ==========================================

    @wire(getFeaturedPerfumes)
    wiredPerfumes({ data, error }) {

        if (data) {

            this.products = this.formatProducts(data);

            this.showAllProducts = false;
            this.errorMessage = '';
            this.isLoading = false;

        } else if (error) {

            this.products = [];
            this.showAllProducts = false;

            this.errorMessage =
                'Unable to load fragrances. Please try again.';

            this.isLoading = false;

            console.error(
                'Featured Perfumes Error:',
                error
            );
        }
    }

    // ==========================================
    // DISPLAY PRODUCTS
    // ==========================================

    get visibleProducts() {

        return this.showAllProducts
            ? this.products
            : this.products.slice(0, 4);
    }

    get showViewAll() {
        return this.products.length > 4 && !this.isLoading;
    }

    get viewAllLabel() {

        return this.showAllProducts
            ? 'Show Less'
            : 'View All Featured Fragrances';
    }

    get viewAllIcon() {
        return this.showAllProducts ? '↑' : '→';
    }

    get hasProducts() {
        return this.products.length > 0 && !this.isLoading;
    }

    get showEmpty() {

        return !this.isLoading &&
            !this.errorMessage &&
            this.products.length === 0;
    }

    // ==========================================
    // VIEW ALL / SHOW LESS
    // ==========================================

    handleViewAll() {
        this.showAllProducts = !this.showAllProducts;
    }

    // ==========================================
    // PRODUCT DETAILS NAVIGATION
    // ==========================================

    handleViewDetails(event) {

        event.stopPropagation();

        const perfumeId = event.currentTarget.dataset.id;

        if (!perfumeId) {
            return;
        }

        this[NavigationMixin.Navigate]({
            type: 'comm__namedPage',

            attributes: {
                name: 'Product_Details__c'
            },

            state: {
                c__recordId: perfumeId,

                // NEW: Identify Featured as source
                c__source: 'featured',

                // Home page is the return destination
                c__returnPage: 'Home'
            }
        });
    }

    // ==========================================
    // KEYBOARD NAVIGATION
    // ==========================================

    handleCardKeydown(event) {

        // Do not intercept keyboard input on
        // nested buttons like Wishlist or View Details.
        if (event.target !== event.currentTarget) {
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.handleViewDetails(event);
        }
    }

    // ==========================================
    // HANDLE BROKEN IMAGES
    // ==========================================

    handleImageError(event) {

        const perfumeId = event.currentTarget.dataset.id;

        this.products = this.products.map(product => {

            if (product.Id === perfumeId) {

                return {
                    ...product,
                    imageUrl: ''
                };
            }

            return product;
        });
    }

    // ==========================================
    // RETRY LOADING
    // ==========================================

    handleRetry() {

        this.isLoading = true;
        this.errorMessage = '';
        this.showAllProducts = false;

        return getFeaturedPerfumes()
            .then(data => {

                this.products = this.formatProducts(data);
            })
            .catch(error => {

                this.products = [];

                this.errorMessage =
                    'Unable to load fragrances. Please try again.';

                console.error(
                    'Retry Error:',
                    error
                );
            })
            .finally(() => {
                this.isLoading = false;
            });
    }
}
