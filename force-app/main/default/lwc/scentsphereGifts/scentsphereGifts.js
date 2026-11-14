
import { LightningElement, wire } from 'lwc';

import {
    NavigationMixin,
    CurrentPageReference
} from 'lightning/navigation';

import getGiftPerfumes
    from '@salesforce/apex/CollectionsController.getGiftPerfumes';

const PRODUCTS_PER_LOAD = 8;

export default class ScentsphereGifts extends NavigationMixin(LightningElement) {

    products = [];

    isLoading = true;
    errorMessage = '';

    selectedGiftCollection = 'All';

    // Pagination
    displayedCount = PRODUCTS_PER_LOAD;

    // Current page reference
    @wire(CurrentPageReference)
    pageReference;

    // Load gift perfumes when page opens
    connectedCallback() {
        this.loadGiftProducts('All');
    }

    // Display only currently visible products
    get visibleProducts() {
        return this.products.slice(0, this.displayedCount);
    }

    // Show Load More only when products remain
    get showLoadMore() {
        return !this.isLoading &&
            this.products.length > this.displayedCount;
    }

    // Currently visible product count
    get visibleCount() {
        return Math.min(
            this.displayedCount,
            this.products.length
        );
    }

    // Check whether products are available
    get hasProducts() {
        return this.products.length > 0 && !this.isLoading;
    }

    // Empty state
    get showEmpty() {
        return (
            !this.isLoading &&
            !this.errorMessage &&
            this.products.length === 0
        );
    }

    // Error state
    get showError() {
        return !this.isLoading && Boolean(this.errorMessage);
    }

    // Dynamic section heading
    get selectedCollectionLabel() {
        return this.selectedGiftCollection === 'All'
            ? 'All Gift Collections'
            : this.selectedGiftCollection;
    }

    // Fetch gift perfumes from Salesforce
    async loadGiftProducts(giftCollection = 'All') {

        this.selectedGiftCollection = giftCollection;
        this.isLoading = true;
        this.errorMessage = '';

        // Reset pagination whenever collection changes
        this.displayedCount = PRODUCTS_PER_LOAD;

        try {

            const result = await getGiftPerfumes({
                giftCollection: giftCollection
            });

            this.products = (result || []).map(product => {

                const stockQuantity = Number(
                    product.Stock_Quantity__c ?? 0
                );

                return {
                    ...product,
                    isOutOfStock: stockQuantity <= 0
                };
            });

        } catch (error) {

            this.products = [];

            this.errorMessage =
                error?.body?.message ||
                error?.message ||
                'Unable to load gift ideas. Please try again.';

            console.error('Gift Products Error:', error);

        } finally {

            this.isLoading = false;
        }
    }

    // Load next 8 gift perfumes
    handleLoadMore() {
        this.displayedCount += PRODUCTS_PER_LOAD;
    }

    // Select Gift Category
    handleGiftCategoryClick(event) {

        const giftCollection =
            event.currentTarget.dataset.giftCollection;

        if (giftCollection) {

            this.loadGiftProducts(giftCollection);

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
    }

    // Explore Gift Ideas button
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

    // Refresh selected Gift Collection
    handleRefresh() {
        this.loadGiftProducts(this.selectedGiftCollection);
    }

    // View all assigned gift perfumes
    // The UI still displays them in batches of 8
    handleShowAllGifts() {
        this.loadGiftProducts('All');
    }

    // Clicking anywhere on a product card
    handleCardClick(event) {

        this.navigateToGiftPerfume(
            event.currentTarget.dataset.id
        );
    }

    // Keyboard accessibility
    handleCardKeydown(event) {

        if (event.target !== event.currentTarget) {
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {

            event.preventDefault();

            this.navigateToGiftPerfume(
                event.currentTarget.dataset.id
            );
        }
    }

    // View Details button
    handleViewDetails(event) {

        event.stopPropagation();

        this.navigateToGiftPerfume(
            event.currentTarget.dataset.id
        );
    }

    // Navigate to Product Details with Gifts context
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
                c__giftCollection: this.selectedGiftCollection
            }
        });
    }
}
