import { LightningElement, wire } from 'lwc';
import {
    NavigationMixin,
    CurrentPageReference
} from 'lightning/navigation';

import getActivePerfumes
    from '@salesforce/apex/PerfumeCatalogController.getActivePerfumes';

const PRODUCTS_PER_LOAD = 12;

export default class PerfumeCatalog extends NavigationMixin(LightningElement) {

    allProducts = [];
    products = [];

    isLoading = true;
    errorMessage = '';

    searchTerm = '';
    searchInput = '';
    selectedCategory = '';
    selectedBrand = '';
    selectedGender = '';
    selectedSort = 'newest';

    // Number of products currently displayed
    displayedCount = PRODUCTS_PER_LOAD;

    // ==========================================
    // RECEIVE SEARCH FROM HEADER
    // ==========================================

    @wire(CurrentPageReference)
    wiredPageReference(pageReference) {

        if (!pageReference) {
            return;
        }

        const headerSearch = pageReference.state?.c__search;

        const newSearchTerm = (
            typeof headerSearch === 'string'
                ? headerSearch
                : ''
        ).trim().toLowerCase();

        if (this.searchTerm !== newSearchTerm) {
            this.searchTerm = newSearchTerm;
            this.searchInput = typeof headerSearch === 'string'
                ? headerSearch.trim()
                : '';
            this.applyFilters();
        }
    }

    // ==========================================
    // LOAD ACTIVE PERFUMES
    // ==========================================

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
            this.displayedCount = PRODUCTS_PER_LOAD;

            this.errorMessage = 'Unable to load perfumes.';

            console.error('Perfume Catalog Error:', error);
        }

        this.isLoading = false;
    }

    // ==========================================
    // LOAD MORE PRODUCTS
    // ==========================================

    // Only display the products loaded so far
    get visibleProducts() {
        return this.products.slice(0, this.displayedCount);
    }

    // Check whether more products are available
    get showLoadMore() {
        return !this.isLoading &&
            this.products.length > this.displayedCount;
    }

    // Current visible product count
    get visibleProductCount() {
        return Math.min(
            this.displayedCount,
            this.products.length
        );
    }

    // Display the next 12 products
    handleLoadMore() {
        this.displayedCount += PRODUCTS_PER_LOAD;
    }

    // ==========================================
    // PRODUCT NAVIGATION
    // ==========================================

    handleCardClick(event) {

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
        return this.getPicklistOptions(
            'Category__c',
            this.selectedCategory
        );
    }

    get brandOptions() {
        return this.getPicklistOptions(
            'Brand__c',
            this.selectedBrand
        );
    }

    get genderOptions() {
        return this.getPicklistOptions(
            'Gender__c',
            this.selectedGender
        );
    }

    getPicklistOptions(fieldName, selectedValue) {

        const values = [
            ...new Set(
                this.allProducts
                    .map(product => product[fieldName])
                    .filter(value => value)
            )
        ];

        return [
            {
                label: 'All',
                value: '',
                key: 'all',
                selected: !selectedValue
            },

            ...values.map(value => ({
                label: value,
                value: value,
                key: value,
                selected: value === selectedValue
            }))
        ];
    }

    get sortOptions() {

        return [
            { label: 'Newest First', value: 'newest' },
            { label: 'Price: Low to High', value: 'lowToHigh' },
            { label: 'Price: High to Low', value: 'highToLow' }
        ].map(option => ({
            ...option,
            key: option.value,
            selected: option.value === this.selectedSort
        }));
    }

    // Gender is shown as pill buttons (few values)
    get genderPills() {
        return this.genderOptions.map(option => ({
            key: option.key,
            value: option.value,
            label: option.label,
            className: option.selected ? 'pill pill-active' : 'pill',
            ariaPressed: option.selected ? 'true' : 'false'
        }));
    }

    // ==========================================
    // ACTIVE FILTER CHIPS
    // ==========================================

    get activeFilters() {

        const chips = [];
        const search = (this.searchInput || '').trim();

        if (search) {
            chips.push({ key: 'search', label: 'Search: ' + search });
        }

        if (this.selectedCategory) {
            chips.push({ key: 'category', label: this.selectedCategory });
        }

        if (this.selectedBrand) {
            chips.push({ key: 'brand', label: this.selectedBrand });
        }

        if (this.selectedGender) {
            chips.push({ key: 'gender', label: this.selectedGender });
        }

        return chips.map(chip => ({
            ...chip,
            ariaLabel: 'Remove filter ' + chip.label
        }));
    }

    get hasActiveFilters() {
        return this.activeFilters.length > 0;
    }

    // ==========================================
    // FILTER HANDLERS
    // ==========================================

    handleCategoryChange(event) {
        this.selectedCategory = event.target.value;
        this.applyFilters();
    }

    handleBrandChange(event) {
        this.selectedBrand = event.target.value;
        this.applyFilters();
    }

    handleGenderPill(event) {
        this.selectedGender = event.currentTarget.dataset.value || '';
        this.applyFilters();
    }

    handleSortChange(event) {
        this.selectedSort = event.target.value;
        this.applyFilters();
    }

    handleRemoveFilter(event) {

        const type = event.currentTarget.dataset.type;

        if (type === 'search') {
            this.searchInput = '';
            this.searchTerm = '';
        } else if (type === 'category') {
            this.selectedCategory = '';
        } else if (type === 'brand') {
            this.selectedBrand = '';
        } else if (type === 'gender') {
            this.selectedGender = '';
        }

        this.applyFilters();
    }

    // Clears search and filters. The sort order is kept.
    handleClearFilters() {

        this.searchInput = '';
        this.searchTerm = '';
        this.selectedCategory = '';
        this.selectedBrand = '';
        this.selectedGender = '';

        this.applyFilters();
    }

    // ==========================================
    // APPLY ALL FILTERS
    // ==========================================

    applyFilters() {

        let result = [...this.allProducts];

        // Search across available product information
        if (this.searchTerm) {

            const searchTerms = this.searchTerm
                .split(/\s+/)
                .filter(term => term);

            result = result.filter(product => {

                const searchableText = [

                    product.Product_Name__c,
                    product.Brand__c,
                    product.Description__c,
                    product.Fragrance_Notes__c,
                    product.Category__c,
                    product.Gender__c,
                    product.Size__c,
                    product.Gift_Collection__c

                ]
                    .filter(value =>
                        value !== null && value !== undefined
                    )
                    .join(' ')
                    .toLowerCase();

                return searchTerms.every(term =>
                    searchableText.includes(term)
                );
            });
        }

        // Category Filter
        if (this.selectedCategory) {

            result = result.filter(
                product =>
                    product.Category__c === this.selectedCategory
            );
        }

        // Brand Filter
        if (this.selectedBrand) {

            result = result.filter(
                product =>
                    product.Brand__c === this.selectedBrand
            );
        }

        // Gender Filter
        if (this.selectedGender) {

            result = result.filter(
                product =>
                    product.Gender__c === this.selectedGender
            );
        }

        // Sorting
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

        // Reset pagination whenever filters or search changes
        this.displayedCount = PRODUCTS_PER_LOAD;
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

    // Total matching product count
    get productCount() {
        return this.products.length;
    }
}