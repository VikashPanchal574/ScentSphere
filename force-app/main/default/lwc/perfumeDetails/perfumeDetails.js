
import { LightningElement, api, wire } from 'lwc';

import {
    CurrentPageReference,
    NavigationMixin
} from 'lightning/navigation';

import {
    MessageContext,
    publish
} from 'lightning/messageService';

import Toast from 'lightning/toast';

import isGuestUser from '@salesforce/user/isGuest';

import CART_UPDATE
    from '@salesforce/messageChannel/CartUpdate__c';

import addToCart
    from '@salesforce/apex/CartController.addToCart';

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

    // Original navigation context
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
                const parsedHistory = JSON.parse(historyParam);

                this.perfumeHistory = Array.isArray(parsedHistory)
                    ? parsedHistory.filter(
                        id => typeof id === 'string' && id
                    )
                    : [];

            } catch (error) {
                this.perfumeHistory = [];
            }
        } else {
            // Support earlier links using previousPerfumeId
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

    // ==========================================
    // BACK BUTTON LABEL
    // ==========================================

    get backButtonLabel() {

        // Priority: return through related perfume history
        if (this.previousPerfumeId) {
            return 'Back to Previous Perfume';
        }

        // NEW: Featured Fragrances
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

            // NEW: Featured products belong to Home
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

        // Preserve category/section when returning
        let returnState = {};

        if (this.navigationSource === 'collections') {

            returnState = {
                c__category: this.returnCategory
            };

        } else if (this.navigationSource === 'featured') {

            // NEW: Tell the Home page to show Featured section
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

                this.loadRelatedPerfumes(1, data.Id);
            }

            this.errorMessage = '';
            this.isLoading = false;

        } else if (error) {

            this.perfume = undefined;
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
    // FETCH RELATED PERFUMES
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

        // Add current perfume to history
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

        const perfumeId = event.currentTarget.dataset.id;

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
    // ADD TO CART
    // ==========================================

    async handleAddToCart() {

        if (this.isGuest) {
            this.handleLogin();
            return;
        }

        if (
            !this.perfume ||
            this.isOutOfStock ||
            this.isAddingToCart
        ) {
            return;
        }

        this.isAddingToCart = true;
        this.cartMessage = '';
        this.cartError = '';

        try {

            await addToCart({
                perfumeId: this.perfume.Id,
                quantity: this.quantity
            });

            this.cartMessage = '';

            Toast.show({
                label: 'Added to Cart',
                message:
                    `${this.perfume.Product_Name__c} has been added to your cart.`,
                variant: 'success',
                mode: 'dismissible'
            }, this);

            publish(this.messageContext, CART_UPDATE, {
                action: 'refresh'
            });

        } catch (error) {

            this.cartError =
                error?.body?.message ||
                'Unable to add perfume to cart.';

            console.error(
                'Add to Cart Error:',
                error
            );

        } finally {
            this.isAddingToCart = false;
        }
    }

    // ==========================================
    // QUANTITY CONTROLS
    // ==========================================

    handleIncrease() {

        if (
            this.perfume &&
            !this.isOutOfStock &&
            this.quantity <
                Number(this.perfume.Stock_Quantity__c)
        ) {
            this.quantity++;
        }
    }

    handleDecrease() {

        if (this.quantity > 1) {
            this.quantity--;
        }
    }

    // ==========================================
    // OUT OF STOCK CHECK
    // ==========================================

    get isOutOfStock() {

        return !this.perfume ||
            Number(this.perfume.Stock_Quantity__c ?? 0) <= 0;
    }

    get isIncreaseDisabled() {

        return this.isOutOfStock ||
            this.quantity >=
                Number(this.perfume?.Stock_Quantity__c || 0);
    }

    get isAddToCartDisabled() {

        return this.isOutOfStock ||
            this.isAddingToCart;
    }

    // ==========================================
    // TOTAL PRICE
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
