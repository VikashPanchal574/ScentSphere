import { LightningElement, wire } from 'lwc';

import {
    NavigationMixin,
    CurrentPageReference
} from 'lightning/navigation';

import getGiftPerfumes
    from '@salesforce/apex/CollectionsController.getGiftPerfumes';

const PRODUCTS_PER_LOAD = 8;

export default class ScentsphereGifts extends NavigationMixin(
    LightningElement
) {

    products = [];
    isLoading = true;
    errorMessage = '';

    selectedGiftCollection = 'All';

    // Pagination
    displayedCount = PRODUCTS_PER_LOAD;
    productRequestId = 0;

    // Current Page Reference
    @wire(CurrentPageReference)
    pageReference;

    // =====================================
    // INITIALIZATION
    // =====================================

    connectedCallback() {
        this.loadGiftProducts('All');
    }

    // Ignore pending responses after leaving page
    disconnectedCallback() {
        this.productRequestId += 1;
    }

    // =====================================
    // PRODUCTS AND PAGINATION GETTERS
    // =====================================

    get visibleProducts() {
        return this.products.slice(
            0,
            this.displayedCount
        );
    }

    get showLoadMore() {
        return !this.isLoading &&
            this.products.length > this.displayedCount;
    }

    get visibleCount() {
        return Math.min(
            this.displayedCount,
            this.products.length
        );
    }

    get hasProducts() {
        return this.products.length > 0 &&
            !this.isLoading;
    }

    get showEmpty() {
        return !this.isLoading &&
            !this.errorMessage &&
            this.products.length === 0;
    }

    get showError() {
        return !this.isLoading &&
            Boolean(this.errorMessage);
    }

    get selectedCollectionLabel() {
        return this.selectedGiftCollection === 'All'
            ? 'All Gift Collections'
            : this.selectedGiftCollection;
    }

    // =====================================
    // LOAD GIFT PRODUCTS
    // =====================================

    async loadGiftProducts(giftCollection = 'All') {

        const requestId = ++this.productRequestId;

        this.selectedGiftCollection = giftCollection;
        this.isLoading = true;
        this.errorMessage = '';

        // Reset pagination when changing category
        this.displayedCount = PRODUCTS_PER_LOAD;

        try {

            // Existing Apex Controller
            const result = await getGiftPerfumes({
                giftCollection: giftCollection
            });

            // Ignore outdated responses
            if (requestId !== this.productRequestId) {
                return;
            }

            this.products = (result || []).map(product => {

                const stockQuantity = Number(
                    product.Stock_Quantity__c ?? 0
                );

                return {
                    ...product,

                    // Keep out-of-stock functionality
                    isOutOfStock: stockQuantity <= 0,

                    // Accessible product card label
                    detailsLabel:
                        'View details for ' +
                        (product.Product_Name__c || 'gift perfume')
                };
            });

        } catch (error) {

            if (requestId !== this.productRequestId) {
                return;
            }

            this.products = [];

            this.errorMessage =
                this.getErrorMessage(error);

            console.error(
                'Gift Products Error:',
                error
            );

        } finally {

            if (requestId === this.productRequestId) {
                this.isLoading = false;
            }
        }
    }

    // =====================================
    // LOAD MORE GIFTS
    // =====================================

    handleLoadMore() {

        this.displayedCount += PRODUCTS_PER_LOAD;
    }

    // =====================================
    // GIFT CATEGORY SELECTION
    // =====================================

    handleGiftCategoryClick(event) {

        const giftCollection =
            event.currentTarget.dataset.giftCollection;

        if (!giftCollection) {
            return;
        }

        // Fetch selected gift category
        this.loadGiftProducts(giftCollection);

        // Scroll to product results
        const target = this.template.querySelector(
            '[data-target="gift-products"]'
        );

        if (target) {

            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }

    // =====================================
    // EXPLORE GIFT IDEAS BUTTON
    // =====================================

    handleExploreGifts() {

        const target = this.template.querySelector(
            '[data-target="gift-products"]'
        );

        if (target) {

            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }

    // =====================================
    // REFRESH BUTTON
    // =====================================

    handleRefresh() {

        // Reload currently selected collection
        this.loadGiftProducts(this.selectedGiftCollection);
    }

    // =====================================
    // VIEW ALL GIFTS
    // =====================================

    handleShowAllGifts() {

        this.loadGiftProducts('All');
    }

    // =====================================
    // WISHLIST BUTTON
    // =====================================

    // Reusable c-wishlist-button handles:
    // Add / Remove Wishlist
    // Apex calls
    // Header Wishlist Count
    // Green / Yellow Header notifications

    // Stop clicking heart from opening Product Details
    stopCardNavigation(event) {

        event.stopPropagation();
    }

    // =====================================
    // PRODUCT CARD CLICK
    // =====================================

    handleCardClick(event) {

        this.navigateToGiftPerfume(
            event.currentTarget.dataset.id
        );
    }

    // =====================================
    // KEYBOARD NAVIGATION
    // =====================================

    handleCardKeydown(event) {

        // Ignore events coming from nested controls
        if (event.target !== event.currentTarget) {
            return;
        }

        if (
            event.key === 'Enter' ||
            event.key === ' '
        ) {

            event.preventDefault();

            this.navigateToGiftPerfume(
                event.currentTarget.dataset.id
            );
        }
    }

    // =====================================
    // VIEW DETAILS BUTTON
    // =====================================

    handleViewDetails(event) {

        event.stopPropagation();

        this.navigateToGiftPerfume(
            event.currentTarget.dataset.id
        );
    }

    // =====================================
    // PRODUCT DETAILS NAVIGATION
    // =====================================

    navigateToGiftPerfume(perfumeId) {

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
                c__source: 'gifts',

                c__returnPage:
                    this.pageReference?.attributes?.name ||
                    'Gifts__c',

                c__giftCollection:
                    this.selectedGiftCollection
            }
        });
    }

    // =====================================
    // ERROR HELPER
    // =====================================

    getErrorMessage(error) {

        return error?.body?.message ||
            error?.message ||
            'Unable to load gift ideas. Please try again.';
    }
}