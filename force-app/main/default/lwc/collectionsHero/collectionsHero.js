import { LightningElement, wire } from 'lwc';

import {
    CurrentPageReference,
    NavigationMixin
} from 'lightning/navigation';

import getPerfumesByCategory
    from '@salesforce/apex/CollectionsController.getPerfumesByCategory';
import USER_ID from '@salesforce/user/Id';

import {
    getRecord,
    getFieldValue
} from 'lightning/uiRecordApi';

import FIRST_NAME_FIELD
    from '@salesforce/schema/User.FirstName';

import USERNAME_FIELD
    from '@salesforce/schema/User.Username';

const PRODUCTS_PER_LOAD = 8;

export default class CollectionsHero extends NavigationMixin(
    LightningElement
) {

    selectedCategory = 'All';
    perfumes = [];

    isLoading = false;
    errorMessage = '';

    currentPageReference;

    // Pagination
    displayedCount = PRODUCTS_PER_LOAD;
    perfumeRequestId = 0;

    // =====================================
    // COLLECTION CATEGORIES
    // =====================================

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

    // =====================================
    // CLEANUP
    // =====================================

    disconnectedCallback() {
        this.perfumeRequestId++;
    }

    // =====================================
    // READ URL CATEGORY
    // =====================================

    @wire(CurrentPageReference)
    getCurrentPageReference(pageReference) {

        if (!pageReference) {
            return;
        }

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

    // =====================================
    // CATEGORY + PAGINATION GETTERS
    // =====================================

    get selectedCategoryLabel() {
        return this.selectedCategory === 'All'
            ? 'All Fragrances'
            : `${this.selectedCategory} Fragrances`;
    }

    get visiblePerfumes() {
        return this.perfumes.slice(0, this.displayedCount);
    }

    get showLoadMore() {
        return !this.isLoading &&
            this.perfumes.length > this.displayedCount;
    }

    get visibleCount() {
        return Math.min(
            this.displayedCount,
            this.perfumes.length
        );
    }

    get hasPerfumes() {
        return this.perfumes.length > 0 &&
            !this.isLoading;
    }

    get showEmptyMessage() {
        return !this.isLoading &&
            !this.errorMessage &&
            this.perfumes.length === 0;
    }

    get showError() {
        return !this.isLoading &&
            Boolean(this.errorMessage);
    }

    // =====================================
    // LOAD PERFUMES
    // =====================================

    async loadPerfumes(category) {

        const requestId = ++this.perfumeRequestId;

        this.selectedCategory = category;
        this.isLoading = true;
        this.errorMessage = '';

        this.displayedCount = PRODUCTS_PER_LOAD;

        try {

            const result = await getPerfumesByCategory({
                category: category
            });

            if (requestId !== this.perfumeRequestId) {
                return;
            }

            this.perfumes = (result || []).map(perfume => {

                const stockQuantity = Number(
                    perfume.Stock_Quantity__c ?? 0
                );

                return {
                    ...perfume,

                    isOutOfStock: stockQuantity <= 0,

                    detailsLabel:
                        'View details for ' +
                        (perfume.Product_Name__c || 'perfume')
                };
            });

        } catch (error) {

            if (requestId !== this.perfumeRequestId) {
                return;
            }

            this.perfumes = [];

            this.errorMessage =
                this.getErrorMessage(error);

            console.error(
                'Collections Perfumes Error:',
                error
            );

        } finally {

            if (requestId === this.perfumeRequestId) {
                this.isLoading = false;
            }
        }
    }


// =====================================
// LOGGED-IN USER FIRST NAME
// =====================================

@wire(getRecord, {
    recordId: USER_ID,
    fields: [FIRST_NAME_FIELD, USERNAME_FIELD]
})
headerUserRecord;

get accountFirstName() {

    const userData = this.headerUserRecord?.data;

    if (!userData) {
        return 'My Account';
    }

    // First priority: Salesforce FirstName
    const firstName = getFieldValue(
        userData,
        FIRST_NAME_FIELD
    );

    if (firstName && firstName.trim()) {
        return firstName.trim();
    }

    // Fallback: First part of Username
    const username = getFieldValue(
        userData,
        USERNAME_FIELD
    );

    if (username) {

        const shortName = username
            .split('@')[0]
            .split(/[._\s-]/)[0];

        if (shortName) {
            return shortName.charAt(0).toUpperCase()
                + shortName.slice(1);
        }
    }

    return 'My Account';
}


    // =====================================
    // LOAD MORE
    // =====================================

    handleLoadMore() {
        this.displayedCount += PRODUCTS_PER_LOAD;
    }

    // =====================================
    // CATEGORY SELECTION
    // =====================================

    handleCategoryClick(event) {

        const category =
            event.currentTarget.dataset.category;

        if (!category) {
            return;
        }

        this.loadPerfumes(category);

        const resultsSection =
            this.template.querySelector(
                '[data-target="perfume-results"]'
            );

        if (resultsSection) {
            resultsSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }

    // =====================================
    // SHOW ALL
    // =====================================

    handleShowAll() {
        this.loadPerfumes('All');
    }

    // =====================================
    // EXPLORE COLLECTIONS
    // =====================================

    handleExplore() {

        const collectionSection =
            this.template.querySelector(
                '[data-target="collection-grid"]'
            );

        if (collectionSection) {
            collectionSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }

    // =====================================
    // PREVENT WISHLIST CLICK NAVIGATION
    // =====================================

    stopCardNavigation(event) {
        event.stopPropagation();
    }

    // =====================================
    // PRODUCT CARD CLICK
    // =====================================

    handleCardClick(event) {

        this.navigateToPerfume(
            event.currentTarget.dataset.id
        );
    }

    handleCardKeydown(event) {

        if (event.target !== event.currentTarget) {
            return;
        }

        if (
            event.key === 'Enter' ||
            event.key === ' '
        ) {
            event.preventDefault();

            this.navigateToPerfume(
                event.currentTarget.dataset.id
            );
        }
    }

    // =====================================
    // VIEW DETAILS
    // =====================================

    handleViewDetails(event) {

        event.stopPropagation();

        this.navigateToPerfume(
            event.currentTarget.dataset.id
        );
    }

    // =====================================
    // PRODUCT DETAILS NAVIGATION
    // =====================================

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

    // =====================================
    // ERROR HELPER
    // =====================================

    getErrorMessage(error) {

        return error?.body?.message ||
            error?.message ||
            'Something went wrong. Please try again.';
    }
}