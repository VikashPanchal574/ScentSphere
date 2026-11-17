
import { LightningElement, wire } from 'lwc';

import {
    NavigationMixin,
    CurrentPageReference
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

import getGiftPerfumes
    from '@salesforce/apex/CollectionsController.getGiftPerfumes';

import getWishlistPerfumeIds
    from '@salesforce/apex/WishlistController.getWishlistPerfumeIds';

import addToWishlist
    from '@salesforce/apex/WishlistController.addToWishlist';

import removeFromWishlist
    from '@salesforce/apex/WishlistController.removeFromWishlist';

import WISHLIST_UPDATE
    from '@salesforce/messageChannel/WishlistUpdate__c';

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

    // Wishlist
    isGuestUser = isGuest;
    wishlistIds = new Set();
    updatingWishlistIds = new Set();

    wishlistSubscription = null;
    wishlistRequestId = 0;
    productRequestId = 0;

    messageContext;

    // Current Page Reference
    @wire(CurrentPageReference)
    pageReference;

    // Lightning Message Service
    @wire(MessageContext)
    wiredMessageContext(context) {

        if (!context) {
            return;
        }

        this.messageContext = context;

        if (!this.wishlistSubscription) {
            this.wishlistSubscription = subscribe(
                context,
                WISHLIST_UPDATE,
                (message) => this.handleWishlistUpdate(message),
                { scope: APPLICATION_SCOPE }
            );
        }
    }

    // =====================================
    // INITIALIZATION
    // =====================================

    connectedCallback() {

        this.loadGiftProducts('All');

        if (!this.isGuestUser) {
            this.loadWishlistIds();
        }
    }

    disconnectedCallback() {

        this.productRequestId += 1;
        this.wishlistRequestId += 1;

        if (this.wishlistSubscription) {
            unsubscribe(this.wishlistSubscription);
            this.wishlistSubscription = null;
        }
    }

    // =====================================
    // EXISTING GETTERS
    // =====================================

    get visibleProducts() {
        return this.products.slice(0, this.displayedCount);
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
        return (
            !this.isLoading &&
            !this.errorMessage &&
            this.products.length === 0
        );
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
    // WISHLIST HEART DISPLAY
    // =====================================

    decorateProduct(product) {

        const isWishlisted =
            this.wishlistIds.has(product.Id);

        const isWishlistUpdating =
            this.updatingWishlistIds.has(product.Id);

        return {
            ...product,

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
                (product.Product_Name__c || 'gift perfume')
        };
    }

    refreshWishlistStates() {

        this.products = this.products.map(
            product => this.decorateProduct(product)
        );
    }

    // =====================================
    // LOAD EXISTING WISHLIST
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

            // Do not overwrite locally updating hearts.
            for (const id of this.updatingWishlistIds) {
                if (this.wishlistIds.has(id)) {
                    loadedIds.add(id);
                } else {
                    loadedIds.delete(id);
                }
            }

            this.wishlistIds = loadedIds;

            this.refreshWishlistStates();

        } catch (error) {

            console.error(
                'Gift Wishlist Load Error:',
                error
            );
        }
    }

    // =====================================
    // SYNC WISHLIST WITH OTHER COMPONENTS
    // =====================================

    handleWishlistUpdate(message) {

        if (!message?.perfumeId) {
            return;
        }

        const perfumeId = message.perfumeId;

        if (this.updatingWishlistIds.has(perfumeId)) {
            return;
        }

        if (typeof message.isWishlisted !== 'boolean') {
            this.loadWishlistIds();
            return;
        }

        const updatedIds = new Set(this.wishlistIds);

        if (message.isWishlisted) {
            updatedIds.add(perfumeId);
        } else {
            updatedIds.delete(perfumeId);
        }

        this.wishlistRequestId += 1;
        this.wishlistIds = updatedIds;

        this.refreshWishlistStates();
    }

    // =====================================
    // WISHLIST ADD / REMOVE
    // =====================================

    async handleWishlistClick(event) {

        // Prevent the parent product card from opening.
        event.preventDefault();
        event.stopPropagation();

        const perfumeId =
            event.currentTarget.dataset.id;

        if (!perfumeId) {
            return;
        }

        // Guests need to sign in before saving.
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

        // Invalidate stale wishlist fetches.
        this.wishlistRequestId += 1;

        this.updatingWishlistIds = new Set([
            ...this.updatingWishlistIds,
            perfumeId
        ]);

        this.refreshWishlistStates();

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

            // Update header Wishlist count.
            if (this.messageContext) {

                publish(
                    this.messageContext,
                    WISHLIST_UPDATE,
                    {
                        perfumeId: perfumeId,
                        isWishlisted: !wasWishlisted
                    }
                );
            }

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
                'Gift Wishlist Update Error:',
                error
            );

            this.showToast(
                'Wishlist Error',
                this.getErrorMessage(error),
                'error'
            );

        } finally {

            const pending = new Set(
                this.updatingWishlistIds
            );

            pending.delete(perfumeId);

            this.updatingWishlistIds = pending;

            this.refreshWishlistStates();
        }
    }

    // =====================================
    // LOAD GIFT PRODUCTS
    // =====================================

    async loadGiftProducts(giftCollection = 'All') {

        const requestId = ++this.productRequestId;

        this.selectedGiftCollection = giftCollection;
        this.isLoading = true;
        this.errorMessage = '';

        // Reset pagination when collection changes.
        this.displayedCount = PRODUCTS_PER_LOAD;

        try {

            const result = await getGiftPerfumes({
                giftCollection: giftCollection
            });

            // Ignore outdated requests.
            if (requestId !== this.productRequestId) {
                return;
            }

            this.products = (result || []).map(product => {

                const stockQuantity = Number(
                    product.Stock_Quantity__c ?? 0
                );

                return this.decorateProduct({
                    ...product,
                    isOutOfStock: stockQuantity <= 0
                });
            });

        } catch (error) {

            if (requestId !== this.productRequestId) {
                return;
            }

            this.products = [];

            this.errorMessage =
                error?.body?.message ||
                error?.message ||
                'Unable to load gift ideas. Please try again.';

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
    // EXISTING LOAD MORE
    // =====================================

    handleLoadMore() {
        this.displayedCount += PRODUCTS_PER_LOAD;
    }

    // =====================================
    // EXISTING GIFT CATEGORY SELECTION
    // =====================================

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

    // =====================================
    // EXISTING EXPLORE BUTTON
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
    // EXISTING REFRESH
    // =====================================

    handleRefresh() {
        this.loadGiftProducts(this.selectedGiftCollection);
    }

    // =====================================
    // EXISTING VIEW ALL GIFTS
    // =====================================

    handleShowAllGifts() {
        this.loadGiftProducts('All');
    }

    // =====================================
    // EXISTING CARD NAVIGATION
    // =====================================

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

    // Existing View Details button
    handleViewDetails(event) {

        event.stopPropagation();

        this.navigateToGiftPerfume(
            event.currentTarget.dataset.id
        );
    }

    // =====================================
    // EXISTING PRODUCT DETAILS ROUTE
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
                c__giftCollection: this.selectedGiftCollection
            }
        });
    }

    // =====================================
    // NOTIFICATIONS
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
