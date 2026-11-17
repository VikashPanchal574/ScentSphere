
import { LightningElement, wire } from 'lwc';

import {
    CurrentPageReference,
    NavigationMixin
} from 'lightning/navigation';

import {
    MessageContext,
    publish,
    subscribe,
    unsubscribe,
    APPLICATION_SCOPE
} from 'lightning/messageService';

import Toast from 'lightning/toast';
import isGuest from '@salesforce/user/isGuest';

import getPerfumesByCategory from
    '@salesforce/apex/CollectionsController.getPerfumesByCategory';

import getWishlistPerfumeIds from
    '@salesforce/apex/WishlistController.getWishlistPerfumeIds';

import addToWishlist from
    '@salesforce/apex/WishlistController.addToWishlist';

import removeFromWishlist from
    '@salesforce/apex/WishlistController.removeFromWishlist';

import WISHLIST_UPDATE from
    '@salesforce/messageChannel/WishlistUpdate__c';

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

    // Wishlist
    isGuestUser = isGuest;
    wishlistIds = new Set();
    updatingWishlistIds = new Set();
    wishlistSubscription = null;
    wishlistRequestId = 0;
    perfumeRequestId = 0;

    @wire(MessageContext)
    messageContext;

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
    // INITIALIZATION
    // =====================================

    connectedCallback() {
        if (!this.isGuestUser) {
            this.loadWishlistIds();
        }
    }

    disconnectedCallback() {
        this.perfumeRequestId++;
        this.wishlistRequestId++;

        if (this.wishlistSubscription) {
            unsubscribe(this.wishlistSubscription);
            this.wishlistSubscription = null;
        }
    }

    // Keep hearts synced with other components
    @wire(MessageContext)
    wiredWishlistContext(context) {

        if (!context || this.wishlistSubscription) {
            return;
        }

        this.wishlistSubscription = subscribe(
            context,
            WISHLIST_UPDATE,
            (message) => this.handleWishlistMessage(message),
            { scope: APPLICATION_SCOPE }
        );
    }

    // =====================================
    // CURRENT PAGE
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
    // WISHLIST UI MAPPING
    // =====================================

    decoratePerfume(perfume) {

        const isWishlisted =
            this.wishlistIds.has(perfume.Id);

        const isWishlistUpdating =
            this.updatingWishlistIds.has(perfume.Id);

        return {
            ...perfume,

            isWishlisted,
            isWishlistUpdating,

            wishlistIcon: isWishlisted
                ? 'utility:favorite'
                : 'utility:heart',

            wishlistButtonClass: isWishlisted
                ? 'wishlist-heart is-active'
                : 'wishlist-heart',

            wishlistTitle: isWishlisted
                ? 'Remove from Wishlist'
                : 'Add to Wishlist',

            detailsLabel:
                'View details for ' +
                (perfume.Product_Name__c || 'perfume')
        };
    }

    refreshPerfumeHeartStates() {
        this.perfumes = this.perfumes.map(
            perfume => this.decoratePerfume(perfume)
        );
    }

    // =====================================
    // LOAD WISHLIST IDS
    // =====================================

    async loadWishlistIds() {

        if (this.isGuestUser) {
            return;
        }

        const requestId = ++this.wishlistRequestId;

        try {
            const ids = await getWishlistPerfumeIds();

            if (requestId !== this.wishlistRequestId) {
                return;
            }

            const loadedIds = new Set(ids || []);

            // Preserve any locally pending toggle result
            for (const id of this.updatingWishlistIds) {
                if (this.wishlistIds.has(id)) {
                    loadedIds.add(id);
                } else {
                    loadedIds.delete(id);
                }
            }

            this.wishlistIds = loadedIds;
            this.refreshPerfumeHeartStates();

        } catch (error) {
            console.error(
                'Collections wishlist load error:',
                error
            );
        }
    }

    handleWishlistMessage(message) {

        if (!message?.perfumeId) {
            return;
        }

        const perfumeId = message.perfumeId;

        // Ignore external updates while this card
        // is already being updated locally.
        if (this.updatingWishlistIds.has(perfumeId)) {
            return;
        }

        const updatedIds = new Set(this.wishlistIds);

        if (message.isWishlisted === true) {
            updatedIds.add(perfumeId);
        } else if (message.isWishlisted === false) {
            updatedIds.delete(perfumeId);
        } else {
            this.loadWishlistIds();
            return;
        }

        this.wishlistIds = updatedIds;
        this.refreshPerfumeHeartStates();
    }

    // =====================================
    // TOGGLE WISHLIST
    // =====================================

    async handleWishlistClick(event) {

        // Never trigger the parent card navigation
        event.preventDefault();
        event.stopPropagation();

        const perfumeId =
            event.currentTarget.dataset.id;

        if (!perfumeId) {
            return;
        }

        if (this.isGuestUser) {
            this[NavigationMixin.Navigate]({
                type: 'comm__loginPage',
                attributes: {
                    actionName: 'login'
                }
            });
            return;
        }

        if (this.updatingWishlistIds.has(perfumeId)) {
            return;
        }

        const wasWishlisted =
            this.wishlistIds.has(perfumeId);

        this.updatingWishlistIds = new Set([
            ...this.updatingWishlistIds,
            perfumeId
        ]);

        this.refreshPerfumeHeartStates();

        try {

            if (wasWishlisted) {
                await removeFromWishlist({
                    perfumeId: perfumeId
                });
            } else {
                await addToWishlist({
                    perfumeId: perfumeId
                });
            }

            const updatedIds = new Set(
                this.wishlistIds
            );

            if (wasWishlisted) {
                updatedIds.delete(perfumeId);
            } else {
                updatedIds.add(perfumeId);
            }

            this.wishlistIds = updatedIds;

            // Invalidate older wishlist fetches
            this.wishlistRequestId++;

            // Keep header and other components updated
            publish(
                this.messageContext,
                WISHLIST_UPDATE,
                {
                    perfumeId: perfumeId,
                    isWishlisted: !wasWishlisted
                }
            );

            this.showToast(
                wasWishlisted
                    ? 'Removed from Wishlist'
                    : 'Added to Wishlist',
                wasWishlisted
                    ? 'Perfume removed successfully.'
                    : 'Perfume added successfully.',
                'success'
            );

        } catch (error) {

            console.error(
                'Collections wishlist error:',
                error
            );

            this.showToast(
                'Wishlist Error',
                this.getErrorMessage(error),
                'error'
            );

        } finally {

            const pendingIds = new Set(
                this.updatingWishlistIds
            );

            pendingIds.delete(perfumeId);

            this.updatingWishlistIds = pendingIds;
            this.refreshPerfumeHeartStates();
        }
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

            this.perfumes = (result || []).map(
                perfume => {

                    const stockQuantity = Number(
                        perfume.Stock_Quantity__c ?? 0
                    );

                    return this.decoratePerfume({
                        ...perfume,
                        isOutOfStock: stockQuantity <= 0
                    });
                }
            );

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
    // PAGINATION
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
    // EXPLORE BUTTON
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
    // CARD CLICK
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
    // TOAST + ERROR HELPERS
    // =====================================

    showToast(title, message, variant) {

        Toast.show({
            label: title,
            message: message,
            variant: variant,
            mode: 'dismissible'
        }, this);
    }

    getErrorMessage(error) {

        return error?.body?.message ||
            error?.message ||
            'Something went wrong. Please try again.';
    }
}
