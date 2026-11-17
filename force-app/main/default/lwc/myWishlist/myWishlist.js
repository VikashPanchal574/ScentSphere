
import { LightningElement, wire } from 'lwc';

import {
    CurrentPageReference,
    NavigationMixin
} from 'lightning/navigation';

import Toast from 'lightning/toast';
import isGuest from '@salesforce/user/isGuest';

import {
    MessageContext,
    publish
} from 'lightning/messageService';

import WISHLIST_UPDATE
    from '@salesforce/messageChannel/WishlistUpdate__c';

import getWishlist
    from '@salesforce/apex/WishlistController.getWishlist';

import removeFromWishlist
    from '@salesforce/apex/WishlistController.removeFromWishlist';

export default class MyWishlist extends NavigationMixin(LightningElement) {

    // User information
    isGuestUser = isGuest;

    // Wishlist data
    wishlistItems = [];

    // Loading states
    isLoading = true;
    isRemoving = false;

    // Error handling
    errorMessage = '';

    // LMS Message Context
    @wire(MessageContext)
    messageContext;

    // Current Wishlist page reference
    @wire(CurrentPageReference)
    currentPageReference;

    // ==========================================
    // INITIAL LOAD
    // ==========================================

    connectedCallback() {

        if (this.isGuestUser) {
            this.isLoading = false;
            return;
        }

        this.loadWishlist();
    }

    // ==========================================
    // LOAD CUSTOMER WISHLIST
    // ==========================================

    async loadWishlist() {

        if (this.isGuestUser) {
            this.isLoading = false;
            return;
        }

        this.isLoading = true;
        this.errorMessage = '';

        try {

            const result = await getWishlist();

            this.wishlistItems = (result || []).map(item => {

                const perfume = item.Perfume__r;

                const stockQuantity = Number(
                    perfume?.Stock_Quantity__c ?? 0
                );

                const isActive = perfume?.Active__c === true;

                const isOutOfStock = stockQuantity <= 0;

                return {
                    ...item,

                    stockQuantity,
                    isOutOfStock,

                    isAvailable:
                        isActive && !isOutOfStock,

                    isCurrentlyUnavailable:
                        !isActive && !isOutOfStock,

                    detailsLabel:
                        'View details for ' +
                        (perfume?.Product_Name__c || 'perfume')
                };
            });

        } catch (error) {

            this.wishlistItems = [];

            this.errorMessage = this.getErrorMessage(error);

            this.showToast(
                'Wishlist Error',
                this.errorMessage,
                'error'
            );

        } finally {

            this.isLoading = false;
        }
    }

    // ==========================================
    // WISHLIST STATES
    // ==========================================

    get hasItems() {
        return this.wishlistItems.length > 0;
    }

    get showEmpty() {
        return (
            !this.isLoading &&
            !this.isGuestUser &&
            !this.errorMessage &&
            !this.hasItems
        );
    }

    get wishlistCount() {
        return this.wishlistItems.length;
    }

    // ==========================================
    // PRODUCT DETAILS NAVIGATION
    // ==========================================

    handleViewDetails(event) {

        event.stopPropagation();

        const perfumeId =
            event.currentTarget.dataset.perfumeId;

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
                c__source: 'wishlist',
                c__returnPage:
                    this.currentPageReference?.attributes?.name ||
                    'Wishlist__c'
            }
        });
    }

    // ==========================================
    // GUEST NAVIGATION
    // ==========================================

    handleGuestLogin() {

        this[NavigationMixin.Navigate]({
            type: 'comm__loginPage',
            attributes: {
                actionName: 'login'
            }
        });
    }

    handleGuestShop() {

        this[NavigationMixin.Navigate]({
            type: 'comm__namedPage',
            attributes: {
                name: 'Shop__c'
            }
        });
    }

    // ==========================================
    // REMOVE FROM WISHLIST
    // ==========================================

    async handleRemove(event) {

        // Prevent card's product navigation.
        event.stopPropagation();

        const perfumeId =
            event.currentTarget.dataset.perfumeId;

        if (!perfumeId || this.isRemoving) {
            return;
        }

        this.isRemoving = true;

        try {

            await removeFromWishlist({
                perfumeId: perfumeId
            });

            // Update local wishlist immediately
            this.wishlistItems = this.wishlistItems.filter(
                item => item.Perfume__c !== perfumeId
            );

            // Notify header through LMS
            publish(this.messageContext, WISHLIST_UPDATE, {
                perfumeId: perfumeId,
                isWishlisted: false
            });

            // Success toast
            this.showToast(
                'Removed from Wishlist',
                'Perfume has been removed successfully.',
                'success'
            );

        } catch (error) {

            this.showToast(
                'Unable to Remove',
                this.getErrorMessage(error),
                'error'
            );

        } finally {

            this.isRemoving = false;
        }
    }

    // ==========================================
    // RETRY LOADING
    // ==========================================

    handleRetry() {
        this.loadWishlist();
    }

    // ==========================================
    // TOAST
    // ==========================================

    showToast(title, message, variant) {

        Toast.show({
            label: title,
            message: message,
            variant: variant,
            mode: 'dismissible'
        }, this);
    }

    // ==========================================
    // ERROR MESSAGE HELPER
    // ==========================================

    getErrorMessage(error) {

        return error?.body?.message ||
            error?.message ||
            'Something went wrong. Please try again.';
    }
}
