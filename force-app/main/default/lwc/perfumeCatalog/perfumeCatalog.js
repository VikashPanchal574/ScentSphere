
import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';

import getActivePerfumes
    from '@salesforce/apex/PerfumeCatalogController.getActivePerfumes';

export default class PerfumeCatalog extends NavigationMixin(LightningElement) {

    allProducts = [];
    products = [];

    isLoading = true;
    errorMessage = '';

    searchTerm = '';
    selectedCategory = '';
    selectedBrand = '';
    selectedGender = '';
    selectedSort = 'newest';

    @wire(getActivePerfumes)
    wiredPerfumes({ data, error }) {

        if (data) {

            this.allProducts = data.map(perfume => {

                const stockQuantity = Number(
                    perfume.Stock_Quantity__c ?? 0
                );

                return {
                    ...perfume,

                    imageUrl: perfume.Product_Image_URL__c || '',

                    // Zero or negative stock means unavailable
                    isOutOfStock: stockQuantity <= 0,

                    formattedPrice: new Intl.NumberFormat('en-IN', {
                        style: 'currency',
                        currency: 'INR',
                        maximumFractionDigits: 0
                    }).format(perfume.Price__c || 0)
                };
            });

            this.errorMessage = '';
            this.applyFilters();

        } else if (error) {

            this.allProducts = [];
            this.products = [];

            this.errorMessage = 'Unable to load perfumes.';

            console.error('Perfume Catalog Error:', error);
        }

        this.isLoading = false;
    }

    // ==========================================
    // PRODUCT NAVIGATION
    // ==========================================

    handleCardClick(event) {

        // Prevent duplicate navigation from buttons
        if (event.target.closest('button')) {
            return;
        }

        this.navigateToPerfume(
            event.currentTarget.dataset.id
        );
    }

    handleCardKeydown(event) {

        if (event.key === 'Enter' || event.key === ' ') {

            event.preventDefault();

            this.navigateToPerfume(
                event.currentTarget.dataset.id
            );
        }
    }

    handleViewDetails(event) {

        event.stopPropagation();

        this.navigateToPerfume(
            event.currentTarget.dataset.id
        );
    }

    // Prevent wishlist clicks from navigating to product details
    stopCardNavigation(event) {
        event.stopPropagation();
    }

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
                c__recordId: perfumeId
            }
        });
    }

    // ==========================================
    // FILTER OPTIONS
    // ==========================================

    get categoryOptions() {
        return this.getPicklistOptions('Category__c');
    }

    get brandOptions() {
        return this.getPicklistOptions('Brand__c');
    }

    get genderOptions() {
        return this.getPicklistOptions('Gender__c');
    }

    getPicklistOptions(fieldName) {

        const values = [
            ...new Set(
                this.allProducts
                    .map(product => product[fieldName])
                    .filter(value => value)
            )
        ];

        return [
            { label: 'All', value: '' },

            ...values.map(value => ({
                label: value,
                value: value
            }))
        ];
    }

    get sortOptions() {

        return [
            { label: 'Newest First', value: 'newest' },
            { label: 'Price: Low to High', value: 'lowToHigh' },
            { label: 'Price: High to Low', value: 'highToLow' }
        ];
    }

    // ==========================================
    // FILTER HANDLERS
    // ==========================================

    handleSearch(event) {
        this.searchTerm = event.target.value.toLowerCase();
        this.applyFilters();
    }

    handleCategoryChange(event) {
        this.selectedCategory = event.detail.value;
        this.applyFilters();
    }

    handleBrandChange(event) {
        this.selectedBrand = event.detail.value;
        this.applyFilters();
    }

    handleGenderChange(event) {
        this.selectedGender = event.detail.value;
        this.applyFilters();
    }

    handleSortChange(event) {
        this.selectedSort = event.detail.value;
        this.applyFilters();
    }

    // ==========================================
    // APPLY FILTERS
    // ==========================================

    applyFilters() {

        let result = [...this.allProducts];

        if (this.searchTerm) {

            result = result.filter(product =>

                (product.Product_Name__c || '')
                    .toLowerCase()
                    .includes(this.searchTerm) ||

                (product.Brand__c || '')
                    .toLowerCase()
                    .includes(this.searchTerm)
            );
        }

        if (this.selectedCategory) {

            result = result.filter(
                product =>
                    product.Category__c === this.selectedCategory
            );
        }

        if (this.selectedBrand) {

            result = result.filter(
                product =>
                    product.Brand__c === this.selectedBrand
            );
        }

        if (this.selectedGender) {

            result = result.filter(
                product =>
                    product.Gender__c === this.selectedGender
            );
        }

        if (this.selectedSort === 'lowToHigh') {

            result.sort(
                (a, b) =>
                    (a.Price__c || 0) - (b.Price__c || 0)
            );

        } else if (this.selectedSort === 'highToLow') {

            result.sort(
                (a, b) =>
                    (b.Price__c || 0) - (a.Price__c || 0)
            );
        }

        this.products = result;
    }

    // ==========================================
    // GETTERS
    // ==========================================

    get hasProducts() {
        return this.products.length > 0;
    }

    get showEmpty() {

        return !this.isLoading &&
            !this.errorMessage &&
            this.products.length === 0;
    }

    get productCount() {
        return this.products.length;
    }
}
