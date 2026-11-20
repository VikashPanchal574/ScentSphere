import { LightningElement, api, wire } from 'lwc';

import Toast from 'lightning/toast';
import isGuest from '@salesforce/user/isGuest';

import {
    MessageContext,
    publish
} from 'lightning/messageService';

import WISHLIST_UPDATE
    from '@salesforce/messageChannel/WishlistUpdate__c';

import getWishlistPerfumeIds
    from '@salesforce/apex/WishlistController.getWishlistPerfumeIds';

import addToWishlist
    from '@salesforce/apex/WishlistController.addToWishlist';

import removeFromWishlist
    from '@salesforce/apex/WishlistController.removeFromWishlist';


export default class WishlistButton extends LightningElement {

    @api perfumeId;

    isWishlisted = false;
    isLoading = false;
    isGuestUser = isGuest;

    @wire(MessageContext)
    messageContext;


    // Load Wishlist status
    connectedCallback() {

        if (!this.isGuestUser && this.perfumeId) {
            this.loadWishlistState();
        }
    }


    async loadWishlistState() {

        this.isLoading = true;

        try {

            const perfumeIds = await getWishlistPerfumeIds();

            this.isWishlisted = (perfumeIds || [])
                .includes(this.perfumeId);

        } catch (error) {

            console.error('Wishlist Load Error:', error);

        } finally {

            this.isLoading = false;
        }
    }


    get buttonLabel() {

        return this.isWishlisted
            ? 'Remove from Wishlist'
            : 'Add to Wishlist';
    }


    get buttonVariant() {

        return this.isWishlisted ? 'brand' : 'border';
    }


    get isButtonDisabled() {

        return this.isLoading || !this.perfumeId;
    }


    // Add / Remove Wishlist
    async handleToggle(event) {

        event.stopPropagation();

        // Prevent duplicate requests
        if (this.isLoading || !this.perfumeId) {
            return;
        }

        if (this.isGuestUser) {

            this.showToast(
                'Login Required',
                'Please login to use your wishlist.',
                'info'
            );

            return;
        }

        this.isLoading = true;

        try {

            if (this.isWishlisted) {

                await removeFromWishlist({
                    perfumeId: this.perfumeId
                });

                this.isWishlisted = false;

            } else {

                await addToWishlist({
                    perfumeId: this.perfumeId
                });

                this.isWishlisted = true;
            }

            // Notify Header:
            // 1. Refresh Wishlist count
            // 2. Display latest green/yellow notification
            publish(this.messageContext, WISHLIST_UPDATE, {
                perfumeId: this.perfumeId,
                isWishlisted: this.isWishlisted
            });

            // Notify parent component
            this.dispatchEvent(
                new CustomEvent('wishlistchange', {
                    detail: {
                        perfumeId: this.perfumeId,
                        isWishlisted: this.isWishlisted
                    }
                })
            );

        } catch (error) {

            this.showToast(
                'Wishlist Error',
                this.getErrorMessage(error),
                'error'
            );

        } finally {

            this.isLoading = false;
        }
    }


    // Salesforce toast for errors and guest login
    showToast(title, message, variant) {

        Toast.show({
            label: title,
            message,
            variant,
            mode: 'dismissible'
        }, this);
    }


    getErrorMessage(error) {

        return error?.body?.message ||
            error?.message ||
            'Something went wrong. Please try again.';
    }
}