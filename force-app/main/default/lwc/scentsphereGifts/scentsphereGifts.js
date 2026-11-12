
import { LightningElement, wire } from 'lwc';

import {
    NavigationMixin,
    CurrentPageReference
} from 'lightning/navigation';

import getGiftPerfumes
    from '@salesforce/apex/CollectionsController.getGiftPerfumes';


export default class ScentsphereGifts extends NavigationMixin(LightningElement) {

    products = [];

    isLoading = true;
    errorMessage = '';

    selectedGiftCollection = 'All';

    // Current page reference
    @wire(CurrentPageReference)
    pageReference;

    // Load assigned gift perfumes when page opens
    connectedCallback() {
        this.loadGiftProducts('All');
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

        try {

            const result = await getGiftPerfumes({
                giftCollection: giftCollection
            });

            this.products = result || [];

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
    handleShowAllGifts() {
        this.loadGiftProducts('All');
    }

    // Navigate to Product Details with Gifts context
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
                c__source: 'gifts',
                c__returnPage:
                    this.pageReference?.attributes?.name ||
                    'Gifts__c'
            }
        });
    }
}
