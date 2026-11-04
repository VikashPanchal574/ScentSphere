import { LightningElement, wire } from 'lwc';

import getFeaturedPerfumes
    from '@salesforce/apex/FeaturedFragrancesController.getFeaturedPerfumes';

export default class FeaturedFragrances extends LightningElement {

    products = [];
    isLoading = true;
    errorMessage = '';

    // Format perfume data received from Apex
    formatProducts(data) {

        return data.map(perfume => ({
            ...perfume,

            // Salesforce Files image URL or external URL fallback
            imageUrl: perfume.imageUrl || '',

            formattedPrice: new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 0
            }).format(perfume.price || 0)
        }));
    }

    @wire(getFeaturedPerfumes)
    wiredPerfumes({ data, error }) {

        if (data) {

            this.products = this.formatProducts(data);
            this.errorMessage = '';
            this.isLoading = false;

        } else if (error) {

            this.products = [];
            this.errorMessage =
                'Unable to load fragrances. Please try again.';
            this.isLoading = false;

            console.error('Featured Perfumes Error:', error);
        }
    }

    get hasProducts() {
        return this.products.length > 0 && !this.isLoading;
    }

    get showEmpty() {
        return !this.isLoading &&
            !this.errorMessage &&
            this.products.length === 0;
    }

    handleViewDetails(event) {

        const perfumeId = event.currentTarget.dataset.id;

        this.dispatchEvent(
            new CustomEvent('viewdetails', {
                detail: { perfumeId },
                bubbles: true,
                composed: true
            })
        );

        console.log('Selected Perfume:', perfumeId);
    }

    handleViewAll() {

        this.dispatchEvent(
            new CustomEvent('viewall', {
                bubbles: true,
                composed: true
            })
        );
    }

    handleImageError(event) {

    const perfumeId = event.currentTarget.dataset.id;

    this.products = this.products.map(product => {
        if (product.Id === perfumeId) {
            return {
                ...product,
                imageUrl: ''
            };
        }

        return product;
    });
}
    handleRetry() {

        this.isLoading = true;
        this.errorMessage = '';

        return getFeaturedPerfumes()
            .then(data => {
                this.products = this.formatProducts(data);
            })
            .catch(error => {
                this.products = [];
                this.errorMessage =
                    'Unable to load fragrances. Please try again.';

                console.error('Retry Error:', error);
            })
            .finally(() => {
                this.isLoading = false;
            });
    }
}
