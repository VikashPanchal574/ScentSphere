
import { LightningElement, wire } from 'lwc';

import {
    NavigationMixin,
    CurrentPageReference
} from 'lightning/navigation';

import {
    MessageContext,
    subscribe,
    unsubscribe,
    APPLICATION_SCOPE
} from 'lightning/messageService';

import { getRecord, getFieldValue } from 'lightning/uiRecordApi';

import USER_ID from '@salesforce/user/Id';
import USERNAME_FIELD from '@salesforce/schema/User.Username';

import isGuestUser from '@salesforce/user/isGuest';
import logoResource from '@salesforce/resourceUrl/ScentSphereLogo';

import getWishlistPerfumeIds
    from '@salesforce/apex/WishlistController.getWishlistPerfumeIds';

import getCartCount
    from '@salesforce/apex/CartController.getCartCount';

import getSuggestions
    from '@salesforce/apex/PerfumeSearchController.getSuggestions';

import WISHLIST_UPDATE
    from '@salesforce/messageChannel/WishlistUpdate__c';

import CART_UPDATE
    from '@salesforce/messageChannel/CartUpdate__c';

export default class ScentsphereHeader extends NavigationMixin(LightningElement) {

    searchTerm = '';
    isMenuOpen = false;

    isGuest = isGuestUser;
    logoUrl = logoResource;

    wishlistCount = 0;
    subscription = null;

    cartCount = 0;
    cartSubscription = null;

    // Search Suggestions
    suggestions = [];
    showSuggestions = false;
    isSearchLoading = false;
    searchError = false;

    searchTimer = null;
    searchCloseTimer = null;
    searchRequestId = 0;
    resizeObserver = null;

    // ==========================================
    // LOGGED-IN USERNAME
    // ==========================================

    // Do not fetch a user record for guest visitors
    userId = isGuestUser ? undefined : USER_ID;

    // Fetch current Salesforce user
    @wire(getRecord, {
        recordId: '$userId',
        fields: [USERNAME_FIELD]
    })
    userRecord;

    // Example:
    // vikash.panchal@gruslabs.com -> Vikash
    get headerUsername() {

        const username = getFieldValue(
            this.userRecord?.data,
            USERNAME_FIELD
        );

        if (!username) {
            return 'My Account';
        }

        const firstName = username
            .split('@')[0]
            .split('.')[0];

        return firstName.charAt(0).toUpperCase() + firstName.slice(1);
    }

    // ==========================================
    // CURRENT PAGE
    // ==========================================

    @wire(CurrentPageReference)
    pageReference;

    // ==========================================
    // MESSAGE CHANNEL SUBSCRIPTIONS
    // ==========================================

    @wire(MessageContext)
    wiredMessageContext(context) {

        if (context && !this.subscription) {

            this.subscription = subscribe(
                context,
                WISHLIST_UPDATE,
                (message) => this.handleWishlistUpdate(message),
                { scope: APPLICATION_SCOPE }
            );
        }

        if (context && !this.cartSubscription) {

            this.cartSubscription = subscribe(
                context,
                CART_UPDATE,
                () => this.loadCartCount(),
                { scope: APPLICATION_SCOPE }
            );
        }
    }

    // ==========================================
    // INITIAL COUNTS
    // ==========================================

    connectedCallback() {

        if (!this.isGuest) {
            this.loadWishlistCount();
            this.loadCartCount();
        }
    }

    // ==========================================
    // SYNC FIXED HEADER HEIGHT
    // ==========================================

    renderedCallback() {

        if (this.resizeObserver) {
            return;
        }

        const shell = this.template.querySelector('.header-fixed');
        const spacer = this.template.querySelector('.header-spacer');

        if (!shell || !spacer) {
            return;
        }

        const syncHeight = () => {
            spacer.style.height = shell.offsetHeight + 'px';
        };

        syncHeight();

        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(syncHeight);
            this.resizeObserver.observe(shell);
        }
    }

    // ==========================================
    // CLEANUP
    // ==========================================

    disconnectedCallback() {

        clearTimeout(this.searchTimer);
        clearTimeout(this.searchCloseTimer);

        this.searchRequestId += 1;

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }

        if (this.subscription) {
            unsubscribe(this.subscription);
            this.subscription = null;
        }

        if (this.cartSubscription) {
            unsubscribe(this.cartSubscription);
            this.cartSubscription = null;
        }
    }

    // ==========================================
    // WISHLIST COUNT
    // ==========================================

    async loadWishlistCount() {

        if (this.isGuest) {
            this.wishlistCount = 0;
            return;
        }

        try {

            const perfumeIds = await getWishlistPerfumeIds();

            this.wishlistCount = perfumeIds.length;

        } catch (error) {

            console.error('Wishlist count error:', error);
            this.wishlistCount = 0;
        }
    }

    // ==========================================
    // CART COUNT
    // ==========================================

    async loadCartCount() {

        if (this.isGuest) {
            this.cartCount = 0;
            return;
        }

        try {

            this.cartCount = await getCartCount();

        } catch (error) {

            console.error('Cart count error:', error);
            this.cartCount = 0;
        }
    }

    handleWishlistUpdate(message) {

        if (message) {
            this.loadWishlistCount();
        }
    }

    get wishlistCountLabel() {

        return this.wishlistCount > 99
            ? '99+'
            : String(this.wishlistCount);
    }

    get cartCountLabel() {

        return this.cartCount > 99
            ? '99+'
            : String(this.cartCount);
    }

    // ==========================================
    // HEADER VISIBILITY
    // ==========================================

    get showHeader() {

        const path = window.location.pathname.toLowerCase();

        const authPages = [
            '/selfregister',
            '/login',
            '/forgotpassword'
        ];

        return !authPages.some(page => path.endsWith(page));
    }

    // ==========================================
    // CURRENT PAGE HIGHLIGHT
    // ==========================================

    get currentPage() {

        const pageName = this.pageReference?.attributes?.name;

        if (pageName === 'About_Contact__c') {

            return this.pageReference?.state?.c__section === 'contact'
                ? 'contact'
                : 'about';
        }

        const pageMap = {
            'Home': 'home',
            'Shop__c': 'shop',
            'Collections__c': 'collections',
            'Shopping_Cart__c': 'cart',
            'My_Wishlist__c': 'wishlist',
            'Gifts__c': 'gifts'
        };

        return pageMap[pageName] || '';
    }

    get homeClass() {
        return this.getNavClass('home');
    }

    get shopClass() {
        return this.getNavClass('shop');
    }

    get collectionsClass() {
        return this.getNavClass('collections');
    }

    get giftsClass() {
        return this.getNavClass('gifts');
    }

    get aboutClass() {
        return this.getNavClass('about');
    }

    get contactClass() {
        return this.getNavClass('contact');
    }

    getNavClass(page) {

        return this.currentPage === page
            ? 'nav-link active'
            : 'nav-link';
    }

    // ==========================================
    // MOBILE MENU
    // ==========================================

    toggleMenu() {
        this.isMenuOpen = !this.isMenuOpen;
    }

    closeMenu() {
        this.isMenuOpen = false;
    }

    get navClass() {

        return this.isMenuOpen
            ? 'navigation open'
            : 'navigation';
    }

    get menuIcon() {
        return this.isMenuOpen ? '✕' : '☰';
    }

    get menuAriaExpanded() {
        return this.isMenuOpen ? 'true' : 'false';
    }

    // ==========================================
    // COMMON NAVIGATION
    // ==========================================

    navigateToPage(pageName) {

        this.closeSearchSuggestions();

        this[NavigationMixin.Navigate]({
            type: 'comm__namedPage',
            attributes: {
                name: pageName
            }
        });

        this.closeMenu();
    }

    navigateToSection(sectionName) {

        this.closeSearchSuggestions();

        this[NavigationMixin.Navigate]({
            type: 'comm__namedPage',
            attributes: {
                name: 'About_Contact__c'
            },
            state: {
                c__section: sectionName,
                c__navRequest: String(Date.now())
            }
        });

        this.closeMenu();
    }

    // ==========================================
    // SEARCH SUGGESTIONS
    // ==========================================

    get hasSuggestions() {
        return this.suggestions.length > 0;
    }

    get suggestionHeading() {

        return this.searchTerm.trim()
            ? 'MATCHING PERFUMES'
            : 'FEATURED PERFUMES';
    }

    get suggestionEmptyMessage() {

        if (this.searchError) {
            return 'Unable to load suggestions. Please try again.';
        }

        return this.searchTerm.trim()
            ? 'No matching perfumes found.'
            : 'No featured perfumes available.';
    }

    get showViewAll() {

        return this.searchTerm.trim().length > 0
            && !this.isSearchLoading;
    }

    handleSearchFocus() {

        clearTimeout(this.searchCloseTimer);

        this.showSuggestions = true;
        this.scheduleSearch(true);
    }

    handleSearch(event) {

        this.searchTerm = event.target.value;
        this.showSuggestions = true;

        this.scheduleSearch(false);
    }

    scheduleSearch(immediate = false) {

        clearTimeout(this.searchTimer);

        const requestId = ++this.searchRequestId;

        this.isSearchLoading = true;
        this.searchError = false;
        this.suggestions = [];

        if (immediate) {
            this.loadSuggestions(requestId);
            return;
        }

        this.searchTimer = setTimeout(() => {
            this.loadSuggestions(requestId);
        }, 250);
    }

    async loadSuggestions(requestId) {

        const term = this.searchTerm.trim();

        try {

            const result = await getSuggestions({
                searchTerm: term
            });

            if (
                requestId !== this.searchRequestId ||
                !this.showSuggestions
            ) {
                return;
            }

            const formatter = new Intl.NumberFormat(
                'en-IN',
                {
                    style: 'currency',
                    currency: 'INR',
                    maximumFractionDigits: 0
                }
            );

            this.suggestions = (result || []).map(item => ({
                ...item,
                formattedPrice: item.price == null
                    ? 'Price unavailable'
                    : formatter.format(item.price)
            }));

            this.searchError = false;

        } catch (error) {

            if (requestId !== this.searchRequestId) {
                return;
            }

            console.error('Perfume suggestions error:', error);

            this.suggestions = [];
            this.searchError = true;

        } finally {

            if (requestId === this.searchRequestId) {
                this.isSearchLoading = false;
            }
        }
    }

    handleSearchFocusOut(event) {

        const nextTarget = event.relatedTarget;

        if (
            nextTarget &&
            this.template.querySelector('.search-area')
                ?.contains(nextTarget)
        ) {
            return;
        }

        clearTimeout(this.searchCloseTimer);

        this.searchCloseTimer = setTimeout(() => {
            this.closeSearchSuggestions();
        }, 180);
    }

    closeSearchSuggestions() {

        clearTimeout(this.searchTimer);
        clearTimeout(this.searchCloseTimer);

        this.searchRequestId += 1;

        this.showSuggestions = false;
        this.isSearchLoading = false;
        this.suggestions = [];
    }

    handleSearchKeydown(event) {

        if (event.key === 'Escape') {
            this.closeSearchSuggestions();
            return;
        }

        if (event.key !== 'Enter') {
            return;
        }

        event.preventDefault();

        const searchValue = this.searchTerm.trim();

        if (!searchValue) {
            return;
        }

        this.navigateToSearchResults(searchValue);
    }

    navigateToSearchResults(searchValue) {

        this.searchTerm = searchValue;
        this.closeSearchSuggestions();

        this[NavigationMixin.Navigate]({
            type: 'comm__namedPage',
            attributes: {
                name: 'Shop__c'
            },
            state: {
                c__search: searchValue,
                c__searchRequest: String(Date.now())
            }
        });

        this.closeMenu();
    }

    handleSuggestionClick(event) {

        const perfumeId = event.currentTarget.dataset.id;

        const selected = this.suggestions.find(
            item => item.id === perfumeId
        );

        if (!selected) {
            return;
        }

        this.navigateToSearchResults(selected.productName);
    }

    handleViewAllResults() {

        const searchValue = this.searchTerm.trim();

        if (searchValue) {
            this.navigateToSearchResults(searchValue);
        }
    }

    // ==========================================
    // ORIGINAL NAVIGATION HANDLERS
    // ==========================================

    handleHome(event) {
        event.preventDefault();
        this.navigateToPage('Home');
    }

    handleShop(event) {
        event.preventDefault();
        this.navigateToPage('Shop__c');
    }

    handleCollections(event) {
        event.preventDefault();
        this.navigateToPage('Collections__c');
    }

    handleGifts(event) {
        event.preventDefault();
        this.navigateToPage('Gifts__c');
    }

    handleAbout(event) {
        event.preventDefault();
        this.navigateToSection('about');
    }

    handleContact(event) {
        event.preventDefault();
        this.navigateToSection('contact');
    }

    handleWishlist() {
        this.navigateToPage('My_Wishlist__c');
    }

    handleCart() {
        this.navigateToPage('Shopping_Cart__c');
    }

    handleLogin() {

        this.closeSearchSuggestions();

        this[NavigationMixin.Navigate]({
            type: 'comm__loginPage',
            attributes: {
                actionName: 'login'
            }
        });

        this.closeMenu();
    }

    handleMyAccount() {
        this.navigateToPage('My_Account__c');
    }
}
