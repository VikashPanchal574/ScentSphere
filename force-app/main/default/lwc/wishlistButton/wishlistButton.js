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

    // LMS Message Context
    @wire(MessageContext)
    messageContext;


    // Load existing wishlist status
    connectedCallback() {
        if (!this.isGuestUser && this.perfumeId) {
            this.loadWishlistState();
        }
    }


    async loadWishlistState() {
        try {
            const perfumeIds = await getWishlistPerfumeIds();

            this.isWishlisted = perfumeIds.includes(this.perfumeId);

        } catch (error) {
            this.showToast(
                'Wishlist Error',
                this.getErrorMessage(error),
                'error'
            );
        }
    }


    // Button label
    get buttonLabel() {
        return this.isWishlisted
            ? 'Remove from Wishlist'
            : 'Add to Wishlist';
    }


    // Highlight saved heart
    get buttonVariant() {
        return this.isWishlisted ? 'brand' : 'border';
    }


    get isButtonDisabled() {
        return this.isLoading || !this.perfumeId;
    }


    // Add or Remove perfume
    async handleToggle(event) {

        // Prevent parent product card navigation
        event.stopPropagation();

        if (this.isGuestUser) {
            this.showToast(
                'Login Required',
                'Please login to add perfumes to your wishlist.',
                'info'
            );
            return;
        }

        if (!this.perfumeId) {
            return;
        }

        this.isLoading = true;

        try {

            if (this.isWishlisted) {

                await removeFromWishlist({
                    perfumeId: this.perfumeId
                });

                this.isWishlisted = false;

                this.showToast(
                    'Removed from Wishlist',
                    'Perfume has been removed from your wishlist.',
                    'success'
                );

            } else {

                await addToWishlist({
                    perfumeId: this.perfumeId
                });

                this.isWishlisted = true;

                this.showToast(
                    'Added to Wishlist ❤️',
                    'Perfume has been added to your wishlist successfully!',
                    'success'
                );
            }

            // Notify Header using Lightning Message Service
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


    // Toast notification
    showToast(title, message, variant) {
        Toast.show({
            label: title,
            message: message,
            variant: variant,
            mode: 'dismissible'
        }, this);
    }


    // Extract Apex error
    getErrorMessage(error) {
        return error?.body?.message ||
            error?.message ||
            'Something went wrong. Please try again.';
    }
}
