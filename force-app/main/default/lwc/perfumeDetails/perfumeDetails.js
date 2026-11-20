
import { LightningElement, api, wire } from 'lwc';

import {
    CurrentPageReference,
    NavigationMixin
} from 'lightning/navigation';

import {
    MessageContext,
    publish
} from 'lightning/messageService';

import isGuestUser from '@salesforce/user/isGuest';

import CART_UPDATE
    from '@salesforce/messageChannel/CartUpdate__c';

import addToCart
    from '@salesforce/apex/CartController.addToCart';

// NEW: Get fresh active Cart details
import getCartFresh
    from '@salesforce/apex/CartController.getCartFresh';

import getPerfumeDetails
    from '@salesforce/apex/PerfumeDetailsController.getPerfumeDetails';

import getRelatedPerfumes
    from '@salesforce/apex/PerfumeDetailsController.getRelatedPerfumes';

export default class PerfumeDetails extends NavigationMixin(LightningElement) {

    @api recordId;

    perfume;
    isLoading = true;
    errorMessage = '';

    quantity = 1;

    isAddingToCart = false;
    cartMessage = '';
    cartError = '';

    // Guest user detection
    isGuest = isGuestUser;

    // ==========================================
    // NEW: CART QUANTITY TRACKING
    // ==========================================

    // Quantity of current perfume already in Cart
    cartPerfumeQuantity = 0;

    // True only when Cart quantity loaded successfully
    cartQuantityLoaded = false;

    // Loading indicator for Cart quantity request
    isCartQuantityLoading = false;

    // Prevent outdated Cart responses
    cartQuantityRequestId = 0;

    // ==========================================
    // ORIGINAL NAVIGATION CONTEXT
    // ==========================================

    navigationSource = 'shop';
    returnPageName;
    returnCategory = 'All';

    // Related product navigation history
    previousPerfumeId;
    perfumeHistory = [];

    // ==========================================
    // RELATED PERFUMES STATE
    // ==========================================

    relatedProducts = [];
    relatedLoading = false;
    relatedError = '';

    relatedPageNumber = 1;
    relatedTotalPages = 0;
    relatedTotalCount = 0;

    relatedRequestedPage = 1;
    relatedRequestToken = 0;

    // ==========================================
    // MESSAGE CONTEXT
    // ==========================================

    @wire(MessageContext)
    messageContext;

    // ==========================================
    // PAGE REFERENCE
    // ==========================================

    @wire(CurrentPageReference)
    getPageReference(pageReference) {

        if (!pageReference) {
            return;
        }

        const state = pageReference.state || {};
        const idFromUrl = state.c__recordId;

        if (idFromUrl && idFromUrl !== this.recordId) {

            this.recordId = idFromUrl;

            // Clear old product while new one loads
            this.perfume = undefined;
            this.isLoading = true;
            this.errorMessage = '';

            this.quantity = 1;
            this.cartMessage = '';
            this.cartError = '';

            // ==================================
            // NEW: RESET OLD PERFUME CART DATA
            // ==================================

            this.cartQuantityRequestId++;
            this.cartPerfumeQuantity = 0;
            this.cartQuantityLoaded = false;
            this.isCartQuantityLoading = false;

            // Reset related pagination
            this.relatedProducts = [];
            this.relatedPageNumber = 1;
            this.relatedRequestedPage = 1;
            this.relatedTotalPages = 0;
            this.relatedTotalCount = 0;
            this.relatedError = '';
            this.relatedLoading = false;

            // Invalidate pending related requests
            this.relatedRequestToken++;
        }


        // Read related-product navigation history
        const historyParam = state.c__perfumeHistory;

        if (historyParam) {

            try {

                const parsedHistory = JSON.parse(
                    historyParam
                );

                this.perfumeHistory = Array.isArray(parsedHistory)
                    ? parsedHistory.filter(
                        id => typeof id === 'string' && id
                    )
                    : [];

            } catch (error) {
                this.perfumeHistory = [];
            }

        } else {

            // Support earlier links
            this.perfumeHistory = state.c__previousPerfumeId
                ? [state.c__previousPerfumeId]
                : [];
        }

        this.previousPerfumeId =
            this.perfumeHistory.length > 0
                ? this.perfumeHistory[
                this.perfumeHistory.length - 1
                ]
                : undefined;

        // Preserve original page for final back navigation
        if (state.c__source === 'related') {

            this.navigationSource =
                state.c__originalSource || 'shop';

            this.returnPageName =
                state.c__originalReturnPage || undefined;

            this.returnCategory =
                state.c__originalCategory || 'All';

        } else {

            this.navigationSource =
                state.c__source || 'shop';

            this.returnPageName =
                state.c__returnPage;

            this.returnCategory =
                state.c__category || 'All';
        }
    }
    get remainingQuantityMessage() {
        return `You can add up to ${this.remainingAddableQuantity} more to your cart.`;
    }

    get showLowStockHint() {

        const stock = Number(
            this.perfume?.Stock_Quantity__c ?? 0
        );

        return !this.isGuest &&
            this.cartQuantityLoaded &&
            stock > 0 &&
            stock < 5 &&
            this.remainingAddableQuantity > 0;
    }


    // ==========================================
    // BACK BUTTON LABEL
    // ==========================================

    get backButtonLabel() {

        if (this.previousPerfumeId) {
            return 'Back to Previous Perfume';
        }

        if (this.navigationSource === 'featured') {
            return 'Back to Featured';
        }

        if (this.navigationSource === 'collections') {
            return 'Back to Collections';
        }

        if (this.navigationSource === 'wishlist') {
            return 'Back to Wishlist';
        }

        if (this.navigationSource === 'gifts') {
            return 'Back to Gifts';
        }

        return 'Back to Shop';
    }

    // ==========================================
    // BACK NAVIGATION
    // ==========================================

    handleBackNavigation() {

        // Return to previous perfume in history
        if (this.previousPerfumeId) {

            const previousId = this.previousPerfumeId;

            const remainingHistory =
                this.perfumeHistory.slice(0, -1);

            this.navigateToPerfume(
                previousId,
                remainingHistory
            );

            return;
        }

        // Original source navigation
        let destinationName = this.returnPageName;

        if (!destinationName) {

            if (this.navigationSource === 'featured') {

                destinationName = 'Home';

            } else if (this.navigationSource === 'collections') {

                destinationName = 'Collections__c';

            } else if (this.navigationSource === 'wishlist') {

                destinationName = 'My_Wishlist__c';

            } else if (this.navigationSource === 'gifts') {

                destinationName = 'Gifts__c';

            } else {

                destinationName = 'Shop__c';
            }
        }

        let returnState = {};

        if (this.navigationSource === 'collections') {

            returnState = {
                c__category: this.returnCategory
            };

        } else if (this.navigationSource === 'featured') {

            returnState = {
                c__scrollTo: 'featured'
            };
        }

        this[NavigationMixin.Navigate]({

            type: 'comm__namedPage',

            attributes: {
                name: destinationName
            },

            state: returnState
        });
    }

    // ==========================================
    // COMMON PRODUCT NAVIGATION
    // ==========================================

    navigateToPerfume(perfumeId, history) {

        if (!perfumeId) {
            return;
        }

        const state = {
            c__recordId: perfumeId,
            c__source: this.navigationSource,
            c__perfumeHistory: JSON.stringify(history)
        };

        if (this.returnPageName) {
            state.c__returnPage = this.returnPageName;
        }

        if (this.navigationSource === 'collections') {
            state.c__category = this.returnCategory;
        }

        this[NavigationMixin.Navigate]({

            type: 'comm__namedPage',

            attributes: {
                name: 'Product_Details__c'
            },

            state
        });

        window.scrollTo({
            top: 0,
            behavior: 'auto'
        });
    }

    // ==========================================
    // FETCH CURRENT PERFUME
    // ==========================================

    @wire(getPerfumeDetails, {
        perfumeId: '$recordId'
    })
    wiredPerfume({ data, error }) {

        if (data) {

            const isDifferentPerfume =
                this.perfume?.Id !== data.Id;

            this.perfume = {

                ...data,

                imageUrl: data.Product_Image_URL__c || '',

                formattedPrice: this.formatCurrency(
                    data.Price__c
                )
            };

            if (isDifferentPerfume) {

                this.quantity = 1;
                this.cartMessage = '';
                this.cartError = '';

                // ==================================
                // NEW: RESET CURRENT CART QUANTITY
                // ==================================

                this.cartQuantityRequestId++;
                this.cartPerfumeQuantity = 0;
                this.cartQuantityLoaded = false;
                this.isCartQuantityLoading = false;

                // Existing related perfumes functionality
                this.loadRelatedPerfumes(1, data.Id);

                // NEW: Check quantity already in Cart
                if (!this.isGuest) {
                    this.loadCartQuantity(data.Id);
                }
            }

            this.errorMessage = '';
            this.isLoading = false;

        } else if (error) {

            this.perfume = undefined;

            // Invalidate Cart quantity requests
            this.cartQuantityRequestId++;
            this.cartPerfumeQuantity = 0;
            this.cartQuantityLoaded = false;
            this.isCartQuantityLoading = false;

            this.relatedProducts = [];
            this.relatedError = '';
            this.relatedLoading = false;
            this.relatedRequestToken++;

            this.errorMessage =
                'Unable to load perfume details.';

            this.isLoading = false;

            console.error(
                'Perfume Details Error:',
                error
            );
        }
    }

    // ==========================================
    // CURRENCY FORMATTING
    // ==========================================

    formatCurrency(amount) {

        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount || 0);
    }

    // ==========================================
    // FRAGRANCE NOTES - INDIVIDUAL CHIPS
    // EXISTING FUNCTIONALITY PRESERVED
    // ==========================================

    get fragranceNoteItems() {

        const notes = this.perfume?.Fragrance_Notes__c;

        if (!notes) {
            return [];
        }

        return String(notes)
            .split(/[,;\n\r]+/)
            .map((note, index) => ({
                key: `fragrance-note-${index}`,
                label: note.trim()
            }))
            .filter(note => note.label.length > 0);
    }

    // ==========================================
    // NEW: LOAD PERFUME QUANTITY FROM CART
    // ==========================================

    async loadCartQuantity(
        perfumeId = this.perfume?.Id
    ) {

        // Guests cannot access customer Cart
        if (this.isGuest || !perfumeId) {
            return;
        }

        const requestId = ++this.cartQuantityRequestId;

        this.isCartQuantityLoading = true;
        this.cartQuantityLoaded = false;

        try {

            // Existing non-cacheable Apex method
            const response = await getCartFresh();

            // Ignore response from older product/request
            if (
                requestId !== this.cartQuantityRequestId ||
                this.perfume?.Id !== perfumeId
            ) {
                return;
            }

            const cartItems = response?.items || [];

            // Sum quantity for current perfume only
            const alreadyInCart = cartItems
                .filter(
                    item => item.Perfume__c === perfumeId
                )
                .reduce(
                    (total, item) =>
                        total + Number(
                            item.Quantity__c || 0
                        ),
                    0
                );

            this.cartPerfumeQuantity = alreadyInCart;

            // Cart quantity successfully loaded
            this.cartQuantityLoaded = true;

            // Calculate how many more can be added
            const remaining =
                this.remainingAddableQuantity;

            // Never leave selected quantity above limit
            if (
                remaining > 0 &&
                this.quantity > remaining
            ) {
                this.quantity = remaining;
            }

            // If remaining = 0, quantity can stay 1
            // but Add to Cart will be disabled.

        } catch (error) {

            if (
                requestId !== this.cartQuantityRequestId ||
                this.perfume?.Id !== perfumeId
            ) {
                return;
            }

            console.error(
                'Cart Quantity Load Error:',
                error
            );

            this.cartQuantityLoaded = false;

            this.cartError =
                'Unable to check your cart quantity. Please refresh the page.';

        } finally {

            if (requestId === this.cartQuantityRequestId) {
                this.isCartQuantityLoading = false;
            }
        }
    }

    // ==========================================
    // NEW: REMAINING QUANTITY USER CAN ADD
    // ==========================================

    get remainingAddableQuantity() {

        const totalStock = Number(
            this.perfume?.Stock_Quantity__c || 0
        );

        // Guests do not have a customer Cart
        const alreadyInCart = this.isGuest
            ? 0
            : this.cartPerfumeQuantity;

        return Math.max(
            0,
            Math.floor(totalStock - alreadyInCart)
        );
    }

    // ==========================================
    // FETCH RELATED PERFUMES
    // EXISTING FUNCTIONALITY PRESERVED
    // ==========================================

    async loadRelatedPerfumes(
        pageNumber = 1,
        perfumeId = this.perfume?.Id
    ) {

        if (!perfumeId) {
            return;
        }

        const requestToken = ++this.relatedRequestToken;

        this.relatedRequestedPage = pageNumber;
        this.relatedLoading = true;
        this.relatedError = '';
        this.relatedProducts = [];

        try {

            const response = await getRelatedPerfumes({
                perfumeId,
                pageNumber
            });

            if (
                requestToken !== this.relatedRequestToken ||
                this.perfume?.Id !== perfumeId
            ) {
                return;
            }

            this.relatedProducts =
                (response?.products || []).map(item => {

                    const stockQuantity = Number(
                        item.Stock_Quantity__c ?? 0
                    );

                    return {

                        ...item,

                        imageUrl:
                            item.Product_Image_URL__c || '',

                        isOutOfStock:
                            !Number.isFinite(stockQuantity) ||
                            stockQuantity <= 0,

                        formattedPrice: this.formatCurrency(
                            item.Price__c
                        )
                    };
                });

            this.relatedPageNumber =
                response?.pageNumber || 1;

            this.relatedTotalPages =
                response?.totalPages || 0;

            this.relatedTotalCount =
                response?.totalCount || 0;

        } catch (error) {

            if (
                requestToken !== this.relatedRequestToken ||
                this.perfume?.Id !== perfumeId
            ) {
                return;
            }

            this.relatedProducts = [];

            this.relatedError =
                error?.body?.message ||
                'Unable to load related fragrances.';

            console.error(
                'Related Fragrances Error:',
                error
            );

        } finally {

            if (requestToken === this.relatedRequestToken) {
                this.relatedLoading = false;
            }
        }
    }

    // ==========================================
    // RELATED PRODUCTS GETTERS
    // ==========================================

    get hasRelatedProducts() {

        return !this.relatedLoading &&
            !this.relatedError &&
            this.relatedProducts.length > 0;
    }

    get relatedEmpty() {

        return !this.relatedLoading &&
            !this.relatedError &&
            this.relatedProducts.length === 0;
    }

    get showRelatedPagination() {

        return !this.relatedError &&
            this.relatedTotalPages > 1;
    }

    get relatedPreviousDisabled() {

        return this.relatedLoading ||
            this.relatedPageNumber <= 1;
    }

    get relatedNextDisabled() {

        return this.relatedLoading ||
            this.relatedPageNumber >= this.relatedTotalPages;
    }

    // ==========================================
    // RELATED PAGINATION
    // ==========================================

    handleRelatedPrevious() {

        if (this.relatedPreviousDisabled) {
            return;
        }

        this.loadRelatedPerfumes(
            this.relatedPageNumber - 1
        );
    }

    handleRelatedNext() {

        if (this.relatedNextDisabled) {
            return;
        }

        this.loadRelatedPerfumes(
            this.relatedPageNumber + 1
        );
    }

    handleRelatedRetry() {

        this.loadRelatedPerfumes(
            this.relatedRequestedPage
        );
    }

    // ==========================================
    // RELATED PRODUCT NAVIGATION
    // ==========================================

    handleRelatedProductClick(event) {

        const perfumeId = event.currentTarget.dataset.id;

        if (!perfumeId || !this.perfume) {
            return;
        }

        const updatedHistory = [
            ...this.perfumeHistory,
            this.perfume.Id
        ];

        this.navigateToPerfume(
            perfumeId,
            updatedHistory
        );
    }

    // Keyboard navigation
    handleRelatedCardKeydown(event) {

        if (
            event.key === 'Enter' ||
            event.key === ' '
        ) {

            event.preventDefault();
            this.handleRelatedProductClick(event);
        }
    }

    // ==========================================
    // RELATED IMAGE FALLBACK
    // ==========================================

    handleRelatedImageError(event) {

        const perfumeId =
            event.currentTarget.dataset.id;

        this.relatedProducts = this.relatedProducts.map(
            item => {

                if (item.Id === perfumeId) {

                    return {
                        ...item,
                        imageUrl: ''
                    };
                }

                return item;
            }
        );
    }

    // ==========================================
    // OPEN SHOP
    // ==========================================

    handleBackToShop() {

        this[NavigationMixin.Navigate]({

            type: 'comm__namedPage',

            attributes: {
                name: 'Shop__c'
            }
        });
    }

    // ==========================================
    // GUEST LOGIN
    // ==========================================

    handleLogin() {

        this[NavigationMixin.Navigate]({

            type: 'comm__loginPage',

            attributes: {
                actionName: 'login'
            }
        });
    }

    // ==========================================
    // UPDATED: ADD TO CART WITH QUANTITY LIMIT
    // ==========================================

    async handleAddToCart() {

        if (this.isGuest) {
            this.handleLogin();
            return;
        }

        // Disable operation when Cart quantity is
        // not ready or selected quantity exceeds limit
        if (
            !this.perfume ||
            this.isAddToCartDisabled
        ) {
            return;
        }

        // Capture values before async request
        const perfumeId = this.perfume.Id;
        const perfumeName =
            this.perfume.Product_Name__c;

        const requestedQuantity = this.quantity;

        this.isAddingToCart = true;
        this.cartMessage = '';
        this.cartError = '';

        try {

            // Existing backend Add to Cart method
            await addToCart({
                perfumeId: perfumeId,
                quantity: requestedQuantity
            });

            this.cartMessage = '';

            // Existing Header count + notification
            publish(this.messageContext, CART_UPDATE, {
                action: 'added',
                perfumeName: perfumeName
            });

            // NEW: Refresh quantity after success
            if (this.perfume?.Id === perfumeId) {

                this.quantity = 1;

                // Get latest quantity already in Cart
                await this.loadCartQuantity(perfumeId);
            }

        } catch (error) {

            const message =
                error?.body?.message ||
                'Unable to add perfume to cart.';

            console.error(
                'Add to Cart Error:',
                error
            );

            // Refresh Cart quantity after stock errors
            if (
                this.perfume?.Id === perfumeId &&
                /stock|quantity/i.test(message)
            ) {
                await this.loadCartQuantity(perfumeId);
            }

            if (this.perfume?.Id === perfumeId) {
                this.cartError = message;
            }

        } finally {

            this.isAddingToCart = false;
        }
    }

    // ==========================================
    // UPDATED: INCREASE QUANTITY
    // ==========================================

    handleIncrease() {

        // Stop at available stock minus Cart quantity
        if (this.isIncreaseDisabled) {
            return;
        }

        this.quantity++;
    }

    // ==========================================
    // DECREASE QUANTITY
    // EXISTING FUNCTIONALITY PRESERVED
    // ==========================================

    handleDecrease() {

        if (this.quantity > 1) {
            this.quantity--;
        }
    }

    // ==========================================
    // OUT OF STOCK CHECK
    // EXISTING FUNCTIONALITY PRESERVED
    // ==========================================

    get isOutOfStock() {

        return !this.perfume ||
            Number(
                this.perfume.Stock_Quantity__c ?? 0
            ) <= 0;
    }

    // ==========================================
    // UPDATED: DISABLE PLUS BUTTON
    // ==========================================

    get isIncreaseDisabled() {

        if (this.isOutOfStock) {
            return true;
        }

        // Logged-in users must wait for Cart data
        if (
            !this.isGuest &&
            (
                this.isCartQuantityLoading ||
                !this.cartQuantityLoaded
            )
        ) {
            return true;
        }

        // Stop at maximum additional quantity
        return this.quantity >=
            this.remainingAddableQuantity;
    }

    // ==========================================
    // UPDATED: DISABLE ADD TO CART
    // ==========================================

    get isAddToCartDisabled() {

        return this.isOutOfStock ||
            this.isAddingToCart ||
            this.isCartQuantityLoading ||
            !this.cartQuantityLoaded ||
            this.remainingAddableQuantity <= 0 ||
            this.quantity > this.remainingAddableQuantity;
    }

    // ==========================================
    // TOTAL PRICE
    // EXISTING FUNCTIONALITY PRESERVED
    // ==========================================

    get totalPrice() {

        if (!this.perfume) {
            return '';
        }

        return this.formatCurrency(
            this.perfume.Price__c * this.quantity
        );
    }
}
