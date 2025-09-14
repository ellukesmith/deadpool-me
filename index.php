<?php
// Get the target URL from the path
$requestUri = $_SERVER['REQUEST_URI'];
$path = ltrim($requestUri, '/');

// Extract the target domain and path
if (empty($path)) {
    die('No target URL specified. Usage: mysite.com/www.example.com/page');
}

// Parse the target URL
$parts = explode('/', $path, 2);
$targetDomain = $parts[0];
$targetPath = isset($parts[1]) ? '/' . $parts[1] : '/';

// Validate domain
if (!filter_var('http://' . $targetDomain, FILTER_VALIDATE_URL)) {
    die('Invalid domain specified');
}

// Build the full target URL
$targetUrl = 'https://' . $targetDomain . $targetPath;

// Add query parameters if they exist
if (!empty($_SERVER['QUERY_STRING'])) {
    $targetUrl .= '?' . $_SERVER['QUERY_STRING'];
}

// Initialize cURL
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $targetUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_HEADER, true);

// Execute the request
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);

if ($response === false) {
    die('Failed to fetch content from target URL');
}

// Separate headers and body
$headers = substr($response, 0, $headerSize);
$body = substr($response, $headerSize);

// Parse and set appropriate headers
$headerLines = explode("\n", $headers);
foreach ($headerLines as $header) {
    $header = trim($header);
    if (empty($header) || strpos($header, 'HTTP/') === 0) continue;
    
    // Skip certain headers that shouldn't be forwarded
    $skipHeaders = ['content-encoding', 'transfer-encoding', 'connection', 'content-length'];
    $headerName = strtolower(explode(':', $header)[0]);
    if (in_array($headerName, $skipHeaders)) continue;
    
    header($header);
}

// Add some helpful headers (optional but good practice)
header('X-Proxy-Server: Deadpool-Proxy');
header('X-Frame-Options: SAMEORIGIN');

// Set the HTTP response code
http_response_code($httpCode);

// Detect and set proper content type for font files
$pathExtension = strtolower(pathinfo(parse_url($targetUrl, PHP_URL_PATH), PATHINFO_EXTENSION));
$fontMimeTypes = [
    'woff' => 'font/woff',
    'woff2' => 'font/woff2',
    'ttf' => 'font/ttf',
    'otf' => 'font/otf',
    'eot' => 'application/vnd.ms-fontobject'
];

if (isset($fontMimeTypes[$pathExtension])) {
    header('Content-Type: ' . $fontMimeTypes[$pathExtension]);
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET');
    header('Cache-Control: public, max-age=31536000'); // Cache for 1 year
}

// Process HTML content
if (strpos($contentType, 'text/html') !== false || 
    preg_match('/<html/i', $body)) {
    
    $body = processHtml($body, $targetDomain);
} elseif (strpos($contentType, 'text/css') !== false) {
    // Process CSS content to route font files through proxy
    $body = processCss($body, $targetDomain);
}

echo $body;

function processHtml($html, $targetDomain) {
    // Get the current site URL
    $currentSite = (isset($_SERVER['HTTPS']) ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'];
    
    // Replace all links to route through our proxy
    $html = preg_replace_callback(
        '/href=["\']([^"\']+)["\']/i',
        function($matches) use ($currentSite, $targetDomain) {
            $url = $matches[1];
            
            // Skip anchors and javascript
            if (strpos($url, '#') === 0 || strpos($url, 'javascript:') === 0) {
                return $matches[0];
            }
            
            // Convert relative URLs to absolute
            if (strpos($url, 'http') !== 0) {
                if (strpos($url, '/') === 0) {
                    $url = $targetDomain . $url;
                } else {
                    $url = $targetDomain . '/' . $url;
                }
            } else {
                // Extract domain from absolute URL
                $parsedUrl = parse_url($url);
                $url = $parsedUrl['host'] . (isset($parsedUrl['path']) ? $parsedUrl['path'] : '/');
                if (isset($parsedUrl['query'])) {
                    $url .= '?' . $parsedUrl['query'];
                }
            }
            
            return 'href="' . $currentSite . '/' . $url . '"';
        },
        $html
    );
    
    // Replace CSS file references from target domain to route through our proxy
    $html = preg_replace_callback(
        '/href=["\']([^"\']*\.css[^"\']*)["\']/',
        function($matches) use ($currentSite, $targetDomain) {
            $url = $matches[1];
            
            // Only process if it's from the target domain or relative
            if (strpos($url, 'http') === 0 && strpos($url, $targetDomain) === false) {
                return $matches[0]; // Don't modify external CSS
            }
            
            // Convert to proxy URL
            if (strpos($url, 'http') !== 0) {
                if (strpos($url, '/') === 0) {
                    $url = $targetDomain . $url;
                } else {
                    $url = $targetDomain . '/' . $url;
                }
            } else {
                $parsedUrl = parse_url($url);
                $url = $parsedUrl['host'] . (isset($parsedUrl['path']) ? $parsedUrl['path'] : '/');
                if (isset($parsedUrl['query'])) {
                    $url .= '?' . $parsedUrl['query'];
                }
            }
            
            return 'href="' . $currentSite . '/' . $url . '"';
        },
        $html
    );
    
    // Replace JavaScript file references from target domain to route through our proxy
    $html = preg_replace_callback(
        '/src=["\']([^"\']*\.js[^"\']*)["\']/',
        function($matches) use ($currentSite, $targetDomain) {
            $url = $matches[1];
            
            // Only process if it's from the target domain or relative
            if (strpos($url, 'http') === 0 && strpos($url, $targetDomain) === false) {
                return $matches[0]; // Don't modify external JS
            }
            
            // Convert to proxy URL
            if (strpos($url, 'http') !== 0) {
                if (strpos($url, '/') === 0) {
                    $url = $targetDomain . $url;
                } else {
                    $url = $targetDomain . '/' . $url;
                }
            } else {
                $parsedUrl = parse_url($url);
                $url = $parsedUrl['host'] . (isset($parsedUrl['path']) ? $parsedUrl['path'] : '/');
                if (isset($parsedUrl['query'])) {
                    $url .= '?' . $parsedUrl['query'];
                }
            }
            
            return 'src="' . $currentSite . '/' . $url . '"';
        },
        $html
    );
    
    // Inject our JavaScript file
    $scriptTag = '<script src="' . $currentSite . '/index.js"></script>';
    
    // Insert script before closing body tag, or before closing html if no body
    if (stripos($html, '</body>') !== false) {
        $html = str_ireplace('</body>', $scriptTag . '</body>', $html);
    } elseif (stripos($html, '</html>') !== false) {
        $html = str_ireplace('</html>', $scriptTag . '</html>', $html);
    } else {
        // If no closing tags found, append to end
        $html .= $scriptTag;
    }
    
    return $html;
}

function processCss($css, $targetDomain) {
    // Get the current site URL
    $currentSite = (isset($_SERVER['HTTPS']) ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'];
    
    // Replace font file references and other assets in CSS
    $css = preg_replace_callback(
        '/url\s*\(\s*["\']?([^"\')\s]+)["\']?\s*\)/',
        function($matches) use ($currentSite, $targetDomain) {
            $url = $matches[1];
            
            // Skip data URLs
            if (strpos($url, 'data:') === 0) {
                return $matches[0];
            }
            
            // Only process if it's from the target domain or relative
            if (strpos($url, 'http') === 0 && strpos($url, $targetDomain) === false) {
                return $matches[0]; // Don't modify external assets
            }
            
            // Convert to proxy URL
            if (strpos($url, 'http') !== 0) {
                if (strpos($url, '/') === 0) {
                    $url = $targetDomain . $url;
                } else {
                    $url = $targetDomain . '/' . $url;
                }
            } else {
                $parsedUrl = parse_url($url);
                $url = $parsedUrl['host'] . (isset($parsedUrl['path']) ? $parsedUrl['path'] : '/');
                if (isset($parsedUrl['query'])) {
                    $url .= '?' . $parsedUrl['query'];
                }
            }
            
            return 'url("' . $currentSite . '/' . $url . '")';
        },
        $css
    );
    
    return $css;
}
?>