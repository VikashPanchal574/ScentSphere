import { LightningElement, wire } from 'lwc';

import {
    CurrentPageReference,
    NavigationMixin
} from 'lightning/navigation';

import getPerfumesByCategory from
    '@salesforce/apex/CollectionsController.getPerfumesByCategory';

export default class CollectionsHero extends NavigationMixin(LightningElement) {

    selectedCategory = 'All';
    perfumes = [];
    isLoading = false;
    errorMessage = '';

    currentPageReference;

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

        if (pageReference) {

            this.currentPageReference = pageReference;

            const category =
                pageReference.state?.c__category || 'All';

            if (
                category !== this.selectedCategory ||
                this.perfumes.length === 0
            ) {
                this.loadPerfumes(category);
            }
        }
    }

    get selectedCategoryLabel() {
        return this.selectedCategory === 'All'
            ? 'All Fragrances'
            : `${this.selectedCategory} Fragrances`;
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

        try {

            const result = await getPerfumesByCategory({
                category: category
            });

            this.perfumes = result;

        } catch (error) {

            this.perfumes = [];

            this.errorMessage =
                error?.body?.message ||
                error?.message ||
                'Unable to load perfumes. Please try again.';

        } finally {
            this.isLoading = false;
        }
    }

    // Category selection and smooth scrolling
    handleCategoryClick(event) {

        const category = event.currentTarget.dataset.category;

        if (category) {

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
    }

    // Show all perfumes
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

    // Navigate to Product Details with Collections context
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
                c__source: 'collections',
                c__returnPage:
                    this.currentPageReference?.attributes?.name ||
                    'Collections__c',
                c__category: this.selectedCategory
            }
        });
    }
}