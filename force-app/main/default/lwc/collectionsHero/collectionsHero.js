
import { LightningElement, wire } from 'lwc';

import {
    CurrentPageReference,
    NavigationMixin
} from 'lightning/navigation';

import getPerfumesByCategory from
    '@salesforce/apex/CollectionsController.getPerfumesByCategory';

const PRODUCTS_PER_LOAD = 8;

export default class CollectionsHero extends NavigationMixin(LightningElement) {

    selectedCategory = 'All';
    perfumes = [];
    isLoading = false;
    errorMessage = '';

    currentPageReference;

    // Pagination
    displayedCount = PRODUCTS_PER_LOAD;

    collectionTypes = [
        {
            id: 'woody',
            number: '01',
            value: 'Woody',
            title: 'Woody',
            description: 'Warm, deep and earthy fragrances.'
        },
        {
            id: 'floral',
            number: '02',
            value: 'Floral',
            title: 'Floral',
            description: 'Elegant fragrances inspired by flowers.'
        },
        {
            id: 'citrus',
            number: '03',
            value: 'Citrus',
            title: 'Citrus',
            description: 'Fresh and refreshing citrus notes.'
        },
        {
            id: 'fresh',
            number: '04',
            value: 'Fresh',
            title: 'Fresh',
            description: 'Clean and uplifting everyday scents.'
        },
        {
            id: 'aquatic',
            number: '05',
            value: 'Aquatic',
            title: 'Aquatic',
            description: 'Cool fragrances inspired by the ocean.'
        },
        {
            id: 'oriental',
            number: '06',
            value: 'Oriental',
            title: 'Oriental',
            description: 'Rich, warm and luxurious fragrances.'
        },
        {
            id: 'spicy',
            number: '07',
            value: 'Spicy',
            title: 'Spicy',
            description: 'Bold fragrances with spicy notes.'
        },
        {
            id: 'gourmand',
            number: '08',
            value: 'Gourmand',
            title: 'Gourmand',
            description: 'Sweet and delicious fragrance notes.'
        }
    ];

    // Restore selected category when returning to Collections
    @wire(CurrentPageReference)
    getCurrentPageReference(pageReference) {

        if (!pageReference) {
            return;
        }

        this.currentPageReference = pageReference;

        const category = pageReference.state?.c__category || 'All';

        if (
            category !== this.selectedCategory ||
            this.perfumes.length === 0
        ) {
            this.loadPerfumes(category);
        }
    }

    // Dynamic category heading
    get selectedCategoryLabel() {

        return this.selectedCategory === 'All'
            ? 'All Fragrances'
            : `${this.selectedCategory} Fragrances`;
    }

    // Show only currently loaded products
    get visiblePerfumes() {
        return this.perfumes.slice(0, this.displayedCount);
    }

    // Show Load More button only when more products remain
    get showLoadMore() {
        return !this.isLoading &&
            this.perfumes.length > this.displayedCount;
    }

    // Number of currently visible products
    get visibleCount() {
        return Math.min(
            this.displayedCount,
            this.perfumes.length
        );
    }

    get hasPerfumes() {
        return this.perfumes.length > 0 && !this.isLoading;
    }

    get showEmptyMessage() {
        return !this.isLoading &&
            !this.errorMessage &&
            this.perfumes.length === 0;
    }

    get showError() {
        return !this.isLoading && Boolean(this.errorMessage);
    }

    // Load perfumes from Apex
    async loadPerfumes(category) {

        this.selectedCategory = category;
        this.isLoading = true;
        this.errorMessage = '';

        // Reset pagination whenever category changes
        this.displayedCount = PRODUCTS_PER_LOAD;

        try {

            const result = await getPerfumesByCategory({
                category: category
            });

            this.perfumes = (result || []).map(perfume => {

                const stockQuantity = Number(
                    perfume.Stock_Quantity__c ?? 0
                );

                return {
                    ...perfume,
                    isOutOfStock: stockQuantity <= 0
                };
            });

        } catch (error) {

            this.perfumes = [];

            this.errorMessage =
                error?.body?.message ||
                error?.message ||
                'Unable to load perfumes. Please try again.';

            console.error(
                'Collections Perfumes Error:',
                error
            );

        } finally {

            this.isLoading = false;
        }
    }

    // Load the next 8 perfumes
    handleLoadMore() {

        this.displayedCount += PRODUCTS_PER_LOAD;
    }

    // Category selection and smooth scrolling
    handleCategoryClick(event) {

        const category = event.currentTarget.dataset.category;

        if (!category) {
            return;
        }

        this.loadPerfumes(category);

        const resultsSection = this.template.querySelector(
            '[data-target="perfume-results"]'
        );

        if (resultsSection) {

            resultsSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }

    // Show all non-gift fragrances
    handleShowAll() {
        this.loadPerfumes('All');
    }

    // Explore Collections button
    handleExplore() {

        const collectionSection = this.template.querySelector(
            '[data-target="collection-grid"]'
        );

        if (collectionSection) {

            collectionSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }

    // Clicking anywhere on the product card opens Product Details
    handleCardClick(event) {

        this.navigateToPerfume(
            event.currentTarget.dataset.id
        );
    }

    // Keyboard navigation
    handleCardKeydown(event) {

        if (event.target !== event.currentTarget) {
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {

            event.preventDefault();

            this.navigateToPerfume(
                event.currentTarget.dataset.id
            );
        }
    }

    // View Details button
    handleViewDetails(event) {

        event.stopPropagation();

        this.navigateToPerfume(
            event.currentTarget.dataset.id
        );
    }

    // Product Details navigation
    navigateToPerfume(perfumeId) {

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
                c__source: 'collections',
                c__returnPage:
                    this.currentPageReference?.attributes?.name ||
                    'Collections__c',
                c__category: this.selectedCategory
            }
        });
    }
}
