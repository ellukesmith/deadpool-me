// Enhanced image replacement and link handling
class ProxyImageReplacer {
    constructor() {
        this.imageFolder = '/images/';
        
        // Track recently used images to avoid repetition
        this.recentlyUsed = [];
        this.maxRecentHistory = 3;
        
        // Organize images by size category for better matching
        this.imageCategories = {
            // Wide/banner images (good for hero sections, banners)
            wide: [
                'deadpool-14.jpg',
                'deadpool-15.jpg',
                'deadpool-16.jpg',
                'deadpool-17.jpg',
                'deadpool-18.jpg'
            ],
            // Portrait/tall images 
            tall: [
                'deadpool-6.jpg',
                'deadpool-7.jpg',
                'deadpool-8.jpg'
            ],
            // Square/general purpose images
            square: [
                'deadpool-1.jpg',
                'deadpool-2.jpg',
                'deadpool-3.jpg',
                'deadpool-4.jpg',
                'deadpool-5.jpg'
            ],
            // Transparent PNG images (for logos, icons, overlays)
            transparent: [
                'deadpool-9.png',
                'deadpool-10.png',
                'deadpool-11.png',
                'deadpool-12.png',
                'deadpool-13.png'
            ]
        };
        
        // Combine all categories into one array
        this.allImages = [
            ...this.imageCategories.wide,
            ...this.imageCategories.tall,
            ...this.imageCategories.square,
            ...this.imageCategories.transparent
        ];
        
        // Configuration options
        this.config = {
            aggressiveMode: false, // Set to true to replace more images
            minScore: 3, // Lower = more replacements
            minWidth: 120,
            minHeight: 120
        };
        
        // Check for URL parameters to override config
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('aggressive') === 'true') {
            this.config.aggressiveMode = true;
            this.config.minScore = 2;
            this.config.minWidth = 80;
            this.config.minHeight = 80;
        }
        
        this.init();
    }
    
    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.start());
        } else {
            this.start();
        }
    }
    
    start() {
        this.replaceImages();
        this.observeNewImages();
        this.interceptLinks();
    }
    
    replaceImages() {
        const images = document.querySelectorAll('img');
        
        images.forEach(img => this.processImage(img));
    }
    
    processImage(img) {
        // Wait for image to load to get real dimensions AND for transparency analysis
        if (img.complete && img.naturalWidth > 0) {
            this.evaluateImage(img);
        } else {
            img.addEventListener('load', () => {
                // Make sure image is really loaded
                if (img.naturalWidth > 0) {
                    this.evaluateImage(img);
                }
            });
            // Also handle error case
            img.addEventListener('error', () => {
                this.evaluateImage(img);
            });
        }
    }
    
    async evaluateImage(img) {
        // Skip if already processed
        if (img.dataset.proxyProcessed) return;
        
        const rect = img.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(img);
        
        // Determine if this is a "large display image"
        if (this.isLargeDisplayImage(img, rect, computedStyle)) {
            await this.replaceWithCustomImage(img);
        }
        
        img.dataset.proxyProcessed = 'true';
    }
    
    isLargeDisplayImage(img, rect, computedStyle) {
        // Primary filter: minimum size threshold
        const minWidth = this.config.minWidth;
        const minHeight = this.config.minHeight;
        
        if (rect.width < minWidth || rect.height < minHeight) {
            return false;
        }
        
        // Skip tiny images that are clearly UI elements
        if (rect.width < 40 || rect.height < 40) {
            return false;
        }
        
        // Check for obvious UI/navigation elements by URL patterns
        const src = img.src.toLowerCase();
        const obviousUIPatterns = ['/icon', '/logo', '/sprite', '/ui/', '/nav', '/menu', '/btn', '/button'];
        if (obviousUIPatterns.some(pattern => src.includes(pattern))) {
            return false;
        }
        
        // Check positioning context - is this in a header/nav area?
        const parent = img.closest('header, nav, .header, .nav, .navbar, .navigation, .menu');
        if (parent) {
            return false;
        }
        
        // Check if image is positioned like a UI element (fixed/absolute in corners)
        const position = computedStyle.position;
        if (position === 'fixed' || position === 'absolute') {
            const top = parseInt(computedStyle.top) || 0;
            const right = parseInt(computedStyle.right) || 0;
            const bottom = parseInt(computedStyle.bottom) || 0;
            const left = parseInt(computedStyle.left) || 0;
            
            // Skip if positioned in corners (likely UI elements)
            if ((top < 100 && left < 100) || (top < 100 && right < 100)) {
                return false;
            }
        }
        
        // Size-based scoring system
        let score = 0;
        
        // Larger images get higher scores
        if (rect.width >= 200 && rect.height >= 200) score += 3;
        else if (rect.width >= 150 && rect.height >= 150) score += 2;
        else score += 1;
        
        // Aspect ratio - favor more rectangular images (typical for content)
        const aspectRatio = rect.width / rect.height;
        if (aspectRatio >= 1.2 && aspectRatio <= 3) score += 2; // Good content ratios
        else if (aspectRatio >= 0.8 && aspectRatio <= 1.2) score += 1; // Square-ish
        
        // Check if image is in main content areas
        const contentParent = img.closest('main, article, section, .content, .post, .product, .gallery, .hero, [role="main"]');
        if (contentParent) score += 2;
        
        // Check if image appears to be decorative/content based on size relative to viewport
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        if (rect.width > viewportWidth * 0.3 || rect.height > viewportHeight * 0.2) {
            score += 2; // Large relative to viewport
        }
        
        // File extension hints (though not reliable, slight boost)
        if (src.match(/\.(jpg|jpeg|png|webp)$/i)) {
            score += 1;
        }
        
        // SVGs are often UI elements, but not always
        if (src.includes('.svg')) {
            score -= 1;
        }
        
        // Return true if score is high enough
        return score >= this.config.minScore;
    }
    
    async replaceWithCustomImage(img) {
        const rect = img.getBoundingClientRect();
        const imageInfo = await this.getImageByDimensions(img, rect);
        const newSrc = this.imageFolder + imageInfo.category + '/' + imageInfo.filename;
        
        // Store original dimensions and styles
        const originalWidth = img.style.width || img.getAttribute('width') || rect.width + 'px';
        const originalHeight = img.style.height || img.getAttribute('height') || rect.height + 'px';
        
        // Preload the new image
        const preloadImg = new Image();
        preloadImg.onload = () => {
            // Replace the main src
            img.src = newSrc;
            
            // Replace srcset if it exists
            if (img.srcset) {
                // For srcset, we'll use the same image for all sizes
                // Format: "image.jpg 1x, image.jpg 2x" or "image.jpg 300w, image.jpg 600w"
                const srcsetEntries = img.srcset.split(',').map(entry => {
                    const parts = entry.trim().split(' ');
                    if (parts.length >= 2) {
                        // Keep the descriptor (1x, 2x, 300w, etc.) but replace the URL
                        return newSrc + ' ' + parts[1];
                    }
                    return newSrc;
                });
                img.srcset = srcsetEntries.join(', ');
            }
            
            // Replace sizes attribute is not needed since we're using the same image
            // but we could clear it to avoid confusion
            if (img.hasAttribute('sizes')) {
                img.removeAttribute('sizes');
            }
            
            // Ensure the image fits the original bounds
            img.style.width = originalWidth;
            img.style.height = originalHeight;
            
            // Use different object-fit based on image type
            if (imageInfo.category === 'transparent') {
                // Transparent images (logos, icons) should fit within bounds without cropping
                img.style.objectFit = 'contain';
                img.style.objectPosition = 'center';
                console.log('Applied object-fit: contain for transparent image');
            } else {
                // Regular images can cover the entire area
                img.style.objectFit = 'cover';
                img.style.objectPosition = 'center';
                console.log('Applied object-fit: cover for regular image');
            }
            
            img.style.transition = 'opacity 0.3s ease';
            img.style.opacity = '0';
            setTimeout(() => {
                img.style.opacity = '1';
            }, 100);
        };
        preloadImg.src = newSrc;
    }
    
    async getImageByDimensions(img, rect) {
        const aspectRatio = rect.width / rect.height;
        const viewportWidth = window.innerWidth;
        const isLargeImage = rect.width > viewportWidth * 0.5 || rect.width > 800;
        const src = img.src.toLowerCase();
        
        // Check if original image is a transparent PNG (async) - CHECK THIS FIRST
        const isTransparentPNG = await this.isTransparentImage(img, src);
        
        // Detect banner/hero images (wide and large)
        const isBannerImage = (
            aspectRatio > 2.0 || // Very wide aspect ratio
            (aspectRatio > 1.5 && isLargeImage) || // Wide and large
            rect.width > viewportWidth * 0.8 || // Takes up most of screen width
            this.isBannerContext(img) // In banner-like container
        );
        
        // Select image category based on dimensions and context
        let selectedCategory;
        let categoryName;
        
        // TRANSPARENCY CHECK FIRST - highest priority
        if (isTransparentPNG) {
            // Use transparent Deadpool images for transparent originals
            selectedCategory = this.imageCategories.transparent;
            categoryName = 'transparent';
            console.log('🎭 Transparent image detected, using transparent Deadpool PNG');
        } else if (isBannerImage) {
            // For banners, prefer wide images
            selectedCategory = this.imageCategories.wide;
            categoryName = 'wide';
            console.log('🎯 Banner detected, using wide Deadpool image');
        } else if (aspectRatio > 1.5) {
            // Wide but not banner-size
            selectedCategory = this.imageCategories.wide;
            categoryName = 'wide';
        } else if (aspectRatio < 0.7) {
            // Tall/portrait
            selectedCategory = this.imageCategories.tall;
            categoryName = 'tall';
        } else {
            // Square-ish or general
            selectedCategory = this.imageCategories.square;
            categoryName = 'square';
        }
        
        // Pick random image from selected category, avoiding recently used ones
        const availableImages = selectedCategory.filter(filename => {
            const fullPath = categoryName + '/' + filename;
            return !this.recentlyUsed.includes(fullPath);
        });
        
        // If all images were recently used, use the full category
        const imagesToChooseFrom = availableImages.length > 0 ? availableImages : selectedCategory;
        
        const randomIndex = Math.floor(Math.random() * imagesToChooseFrom.length);
        const selectedFilename = imagesToChooseFrom[randomIndex];
        const fullPath = categoryName + '/' + selectedFilename;
        
        // Add to recently used and maintain buffer size
        this.recentlyUsed.push(fullPath);
        if (this.recentlyUsed.length > this.maxRecentHistory) {
            this.recentlyUsed.shift(); // Remove oldest
        }
        
        console.log('Selected:', selectedFilename, 'Recently used:', this.recentlyUsed);
        
        return {
            category: categoryName,
            filename: selectedFilename
        };
    }
    
    async isTransparentImage(img, src) {
        console.log('=== TRANSPARENCY CHECK STARTED ===');
        console.log('Image src:', src);
        console.log('Image srcset:', img.srcset);
        
        // Use srcset URL if available, otherwise use src
        let urlToCheck = src;
        if (img.srcset) {
            // Parse srcset to get the first URL
            const srcsetEntries = img.srcset.split(',');
            if (srcsetEntries.length > 0) {
                const firstEntry = srcsetEntries[0].trim().split(' ')[0];
                urlToCheck = firstEntry;
                console.log('Using srcset URL instead:', urlToCheck);
            }
        }
        
        try {
            let imageToCheck;
            
            if (urlToCheck.startsWith('data:')) {
                console.log('Data URL - creating fresh image element');
                // Create a fresh image element for data URLs
                imageToCheck = new Image();
                imageToCheck.crossOrigin = 'anonymous';
                
                await new Promise((resolve, reject) => {
                    imageToCheck.onload = resolve;
                    imageToCheck.onerror = reject;
                    imageToCheck.src = urlToCheck;
                });
            } else {
                console.log('Loading image through proxy for transparency check');
                
                // For regular URLs, load through proxy
                imageToCheck = new Image();
                imageToCheck.crossOrigin = 'anonymous';
                
                const currentSite = window.location.origin;
                let proxyUrl;
                
                if (urlToCheck.startsWith('http')) {
                    const url = new URL(urlToCheck);
                    proxyUrl = currentSite + '/' + url.hostname + url.pathname;
                } else {
                    proxyUrl = currentSite + '/' + urlToCheck;
                }
                
                console.log('Loading through proxy:', proxyUrl);
                
                await new Promise((resolve, reject) => {
                    imageToCheck.onload = resolve;
                    imageToCheck.onerror = reject;
                    imageToCheck.src = proxyUrl;
                });
            }
            
            console.log('Image loaded, checking transparency');
            return await this.checkTransparencyWithCanvas(imageToCheck);
            
        } catch (e) {
            console.log('Transparency check failed:', e);
            return false;
        }
    }

    async checkTransparencyWithCanvas(img) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set canvas size to match image
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        
        console.log('Canvas size:', canvas.width, 'x', canvas.height);
        
        // Draw the image to canvas
        ctx.drawImage(img, 0, 0);
        
        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        console.log('Total pixels:', data.length / 4);
        
        // Sample more alpha values for debugging
        const sampleAlphas = [];
        for (let i = 3; i < Math.min(data.length, 400); i += 4) {
            sampleAlphas.push(data[i]);
        }
        console.log('Sample alpha values (first 100 pixels):', sampleAlphas);
        
        // Check alpha channel - count different alpha levels
        let fullyOpaque = 0;
        let partiallyTransparent = 0;
        let fullyTransparent = 0;
        let totalPixels = data.length / 4;
        
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] === 255) {
                fullyOpaque++;
            } else if (data[i] === 0) {
                fullyTransparent++;
            } else {
                partiallyTransparent++;
            }
        }
        
        console.log('Fully opaque pixels (255):', fullyOpaque);
        console.log('Partially transparent pixels (1-254):', partiallyTransparent);
        console.log('Fully transparent pixels (0):', fullyTransparent);
        console.log('Total pixels:', totalPixels);
        
        // Only consider it transparent if there are actually transparent pixels
        // Ignore tiny amounts of anti-aliasing
        const transparentPixelCount = fullyTransparent + partiallyTransparent;
        const transparencyPercentage = (transparentPixelCount / totalPixels) * 100;
        
        console.log('Transparency percentage:', transparencyPercentage.toFixed(4) + '%');
        
        // Require at least 0.1% transparency to avoid false positives from compression artifacts
        const hasSignificantTransparency = transparencyPercentage > 0.1;
        
        console.log('Has significant transparency (>0.1%):', hasSignificantTransparency);
        
        return hasSignificantTransparency;
    }
    
    isBannerContext(img) {
        // Check if image is in typical banner/hero contexts
        const bannerSelectors = [
            '.hero', '.banner', '.header-image', '.cover', '.featured-image',
            '.hero-section', '.banner-section', '.jumbotron', '.masthead',
            '[class*="hero"]', '[class*="banner"]', '[class*="cover"]'
        ];
        
        for (let selector of bannerSelectors) {
            if (img.closest(selector)) {
                return true;
            }
        }
        
        // Check if parent has banner-like characteristics
        const parent = img.parentElement;
        if (parent) {
            const parentRect = parent.getBoundingClientRect();
            const parentAspectRatio = parentRect.width / parentRect.height;
            
            // Parent is very wide and takes up significant viewport width
            if (parentAspectRatio > 2.5 && parentRect.width > window.innerWidth * 0.7) {
                return true;
            }
        }
        
        return false;
    }
    
    observeNewImages() {
        // Watch for dynamically loaded images
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Element node
                        if (node.tagName === 'IMG') {
                            this.processImage(node);
                        } else {
                            const imgs = node.querySelectorAll ? node.querySelectorAll('img') : [];
                            imgs.forEach(img => this.processImage(img));
                        }
                    }
                });
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    interceptLinks() {
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (!link) return;
            
            const href = link.getAttribute('href');
            if (!href) return;
            
            // Skip external links that aren't routed through our proxy
            if (href.startsWith('http') && !href.includes(window.location.host)) {
                e.preventDefault();
                const currentSite = window.location.origin;
                const targetUrl = href.replace(/^https?:\/\//, '');
                window.location.href = currentSite + '/' + targetUrl;
            }
        });
    }
}

// Initialize when script loads
new ProxyImageReplacer();