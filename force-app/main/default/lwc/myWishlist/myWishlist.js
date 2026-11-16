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


    // Load wishlist when page opens
    connectedCallback() {

        if (this.isGuestUser) {
            this.isLoading = false;
            return;
        }

        this.loadWishlist();
    }


    // Fetch customer's wishlist
   
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

                // Stock is zero
                isOutOfStock,

                // Active perfume with stock
                isAvailable:
                    isActive && !isOutOfStock,

                // Inactive perfume with remaining stock
                isCurrentlyUnavailable:
                    !isActive && !isOutOfStock
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


    // Check whether wishlist contains products
    get hasItems() {
        return this.wishlistItems.length > 0;
    }


    // Show empty wishlist message
    get showEmpty() {
        return (
            !this.isLoading &&
            !this.isGuestUser &&
            !this.errorMessage &&
            !this.hasItems
        );
    }


    // Display total wishlist items
    get wishlistCount() {
        return this.wishlistItems.length;
    }


    // Navigate to Product Details with Wishlist context
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



    // Remove perfume from wishlist
    async handleRemove(event) {

        event.stopPropagation();

        const perfumeId = event.currentTarget.dataset.perfumeId;

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

            // Notify Header through LMS
            publish(this.messageContext, WISHLIST_UPDATE, {
                perfumeId: perfumeId,
                isWishlisted: false
            });

            // Success notification
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


    // Retry loading wishlist
    handleRetry() {
        this.loadWishlist();
    }


    // Toast notification
    showToast(title, message, variant) {

        Toast.show({
            label: title,
            message: message,
            variant: variant,
            mode: 'dismissible'
        }, this);
    }


    // Extract error message
    getErrorMessage(error) {

        return error?.body?.message ||
            error?.message ||
            'Something went wrong. Please try again.';
    }
}