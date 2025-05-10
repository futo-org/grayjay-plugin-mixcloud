/**
 * Mixcloud Plugin for Grayjay
 * 
 * This plugin enables browsing, searching, and streaming Mixcloud content.
 */

// ---------------------- Constants ----------------------
const PLATFORM = {
  name: "Mixcloud"
};

const URLS = {
  GRAPHQL_URL: "https://app.mixcloud.com/graphql",
  BASE_URL: "https://www.mixcloud.com"
}

// Default request headers for API requests
const DEFAULT_REST_HEADERS = {
  "Origin": URLS.BASE_URL,
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0",
  "Content-Type": "application/json"
};

// Regular expressions for URL matching
const REGEX = {
  LIVE_STREAM_URL: /^https:\/\/www\.mixcloud\.com\/live\/([a-zA-Z0-9_-]+)\/?$/,
  CONTENT_DETAILS_URL: /^https:\/\/www\.mixcloud\.com\/([^\/]+)\/([^\/]+)\/?$/, // Permissive pattern to handle multiple scripts such as Mandarin
  CHANNEL_URL: /^https:\/\/www\.mixcloud\.com\/([a-zA-Z0-9_-]+)\/?$/
};

// list of URLs that should not be matched on source.isChannelUrl, source.isContentDetailsUrl, source.isPlaylistUrl
// since mixcloud does not have a dedicated perfix url for channels and published content
// this way those URLs are not matched as channel or content details URL and fail gracefully
const RESERVED_URL_LIST = [
  "https://www.mixcloud.com/genres/",
  "https://www.mixcloud.com/pro/monetization/",
  "https://www.mixcloud.com/pro/host-tagging/",
  "https://www.mixcloud.com/pro/live/",
  "https://www.mixcloud.com/pro/unlimited-uploads/",
  "https://www.mixcloud.com/pro/posts/",
  "https://www.mixcloud.com/pro/customization/",
  "https://www.mixcloud.com/pro/stats/",
  "https://www.mixcloud.com/pro/hq-audio/",
  "https://www.mixcloud.com/premium/",
  "https://www.mixcloud.com/login/",
  "https://www.mixcloud.com/brand/",
  "https://www.mixcloud.com/privacy/",
  "https://www.mixcloud.com/terms/",
  "https://www.mixcloud.com/dmca/",
  "https://www.mixcloud.com/developers/",
  "https://www.mixcloud.com/subscription-terms/",
  "https://www.mixcloud.com/select-terms/",
  "https://www.mixcloud.com/about/",
  "https://www.mixcloud.com/settings/",
  "https://www.mixcloud.com/settings/applications/",
  "https://www.mixcloud.com/settings/notifications/",
  "https://www.mixcloud.com/settings/profile/",
  "https://www.mixcloud.com/settings/account/",
  "https://www.mixcloud.com/pro/tips/",
  "https://www.mixcloud.com/home/new-uploads/",
  "https://www.mixcloud.com/settings/monetization/tips/",
  "https://www.mixcloud.com/settings/payments/",
  "https://www.mixcloud.com/settings/monetization/subscriptions/",
  "https://www.mixcloud.com/notifications/",
  "https://www.mixcloud.com/upload/",
  "https://www.mixcloud.com/pro/",
  "https://www.mixcloud.com/plans/",
  "https://www.mixcloud.com/dashboard/posts/",
  "https://www.mixcloud.com/dashboard/earnings/",
  "https://www.mixcloud.com/dashboard/my-shows/",
  "https://www.mixcloud.com/dashboard/my-tracks/",
  "https://www.mixcloud.com/dashboard/stats/",
  "https://www.mixcloud.com/home/for-you/",
  "https://www.mixcloud.com/home/feed/",
  "https://www.mixcloud.com/live/",
  "https://www.mixcloud.com/discover/",
  "https://www.mixcloud.com/playlists/",
  "https://www.mixcloud.com/trending/",
  "https://www.mixcloud.com/favorites/",
  "https://www.mixcloud.com/history/",
  "https://www.mixcloud.com/listen-later/",
  "https://www.mixcloud.com/dashboard/playlists/",
  "https://www.mixcloud.com/jobs/",
  "https://www.mixcloud.com/press/",
  "https://www.mixcloud.com/advertise/",
  "https://www.mixcloud.com/faq/",
  "https://www.mixcloud.com/categories/",
  "https://www.mixcloud.com/signup/",
  "https://www.mixcloud.com/contact/",
  "https://www.mixcloud.com/apps/",
  "https://www.mixcloud.com/featured/",
  "https://www.mixcloud.com/popular/",
  "https://www.mixcloud.com/new/",
  "https://www.mixcloud.com/search/",
]

// Plugin configuration storage
let config;

source.enable = function (conf, settings, saveStateStr) {
  config = conf ?? {};
};

// ====================== PLUGIN ENTRY POINTS ======================

/**
 * Gets the home feed (currently live streams)
 * @returns {ContentPager} A pager for live streams
 */
source.getHome = function () {
  return new LiveStreamPager();
};

/**
 * Checks if a URL is a content details URL
 * @param {string} url URL to check
 * @returns {boolean} True if URL is a content details URL
 */
source.isContentDetailsUrl = function (url) {

  // Check if URL is in the reserved list
  if (isPlatformReserverdUrl(url)) {
    return false;
  }

  // Match live streams
  if (urlMatches(url, REGEX.LIVE_STREAM_URL)) {
    return true;
  }

  // Match regular mixes (format: https://www.mixcloud.com/username/mix-name/)
  if (urlMatches(url, REGEX.CONTENT_DETAILS_URL)) {
    return true;
  }

  return false;
};

/**
 * Gets details for a content URL
 * @param {string} url Content URL
 * @returns {PlatformVideoDetails} Details about the content
 */
source.getContentDetails = function (encodedUrl) {

  const url = decodeURIComponent(encodedUrl);

  const isLive = urlMatches(url, REGEX.LIVE_STREAM_URL);

  if (isLive) {
    return getContentDetailsLiveStream(url);
  } else {
    return getContentDetailsCloudcast(url);
  }
};

/**
 * Gets streaming sources for content
 * @param {string} url Content URL
 * @returns {Promise<Object>} Promise resolving to streaming sources
 */
source.getContentStream = function (url) {
  // Get the content details, which already contains the streaming details
  return source.getContentDetails(url).then(details => {
    // For live streams
    if (details.isLive) {
      return {
        videoSources: [{
          url: details.video.hls,
          type: "hls"
        }]
      };
    }

    // For regular mixes
    if (details.video && details.video.audioSources && details.video.audioSources.length > 0) {
      return {
        audioSources: details.video.audioSources.map(source => ({
          url: source.url,
          type: source.type || "hls"
        }))
      };
    }

    // No valid sources found
    throw new UnavailableException("No valid streaming sources found");
  });
};

/**
 * Returns chat window information for live Mixcloud streams with chat
 * @param {string} url - The video URL
 * @returns {Object|null} Chat window configuration or null if chat not available
 */
source.getLiveChatWindow = function (url) {
  const usernameMatch = url.match(REGEX.LIVE_STREAM_URL);

  if (usernameMatch && usernameMatch[1]) {
    // Extract username from live stream URL using regex capture group
    const username = usernameMatch[1];

    return {
      url: `${createMixcloudUrl(username, null, true)}chat/`,
      removeElements: [],
      removeElementsInterval: []
    };
  }
};

/**
 * Checks if a URL is a channel URL
 * @param {string} url URL to check
 * @returns {boolean} True if URL is a channel URL
 */
source.isChannelUrl = function (url) {
  // Check if URL is in the reserved list
  if (isPlatformReserverdUrl(url)) {
    return false;
  }

  return urlMatches(url, REGEX.CHANNEL_URL);
};

/**
 * Gets channel information
 * @param {string} url Channel URL
 * @returns {PlatformChannel} Channel information
 */
source.getChannel = function (url) {
  const usernameMatch = url.match(REGEX.CHANNEL_URL);

  if (!usernameMatch || !usernameMatch[1]) {
    throw new UnavailableException("Not able to access channel information");
  }

  // Extract username from channel URL using regex capture group
  const username = usernameMatch[1];

  const channelInfo = makeGraphQLRequest("ChannelInfoByUsername", {
    "lookup": {
      "username": username
    }
  });

  if (!channelInfo?.data?.user) {
    throw new UnavailableException("Channel not found");
  }

  const links = {};

  if (channelInfo.data.user.socialMediaLinks) {
    channelInfo.data.user.socialMediaLinks.forEach(link => {
      links[capitalizeFirstLetter(link.platform) || link.deeplink] = link.deeplink;
    });
  }

  if (channelInfo.data.user.customLinks) {
    channelInfo.data.user.customLinks.forEach(link => {
      links[capitalizeFirstLetter(link.title) || link.url] = link.url;
    });
  }

  return new PlatformChannel({
    id: new PlatformID(PLATFORM.name, channelInfo.data.user.id, config.id),
    name: channelInfo.data.user.displayName,
    description: channelInfo.data.user.biog,
    url: url,
    thumbnail: channelInfo.data.user.picture?.urlRoot ?
      createThumbnailUrl(channelInfo.data.user.picture.urlRoot, 272, 272) :
      null,
    banner: channelInfo.data.user.coverPicture?.urlRoot ?
      createThumbnailUrl(channelInfo.data.user.coverPicture.urlRoot, 1460, 370) :
      null,
    subscribers: channelInfo.data.user.followers?.totalCount || 0,
    links: links
  });
};

/**
 * Gets channel content
 * @param {string} url Channel URL
 * @returns {ContentPager} A pager for channel content
 */
source.getChannelContents = function (url) {
  const usernameMatch = url.match(REGEX.CHANNEL_URL);

  if (!usernameMatch || !usernameMatch[1]) {
    throw new UnavailableException("Not able to access channel information");
  }

  // Extract username from channel URL using regex capture group
  const username = usernameMatch[1];

  // First get the channel ID which is needed for pagination queries
  const channelInfo = makeGraphQLRequest("ChannelInfoByUsername", {
    "lookup": {
      "username": username
    }
  });

  if (!channelInfo?.data?.user?.id) {
    throw new UnavailableException("Channel not found");
  }

  const initialData = [];

  if (channelInfo?.data?.user?.liveStream?.streamStatus === 'LIVE') {
    initialData.push(source.getContentDetails(createMixcloudUrl(username, null, true)));
  }

  // Return a pager that will load channel uploads with pagination
  return new ChannelContentPager(channelInfo.data.user.id, username, initialData);
};

/**
 * Searches for content
 * @param {string} query Search query
 * @returns {ContentPager} A pager for search results
 */
source.search = function (query) {
  return new SearchPager(query);
};

/**
 * Searches for channels
 * @param {string} query Search query
 * @returns {ContentPager} A pager for channel search results
 */
source.searchChannels = function (query) {
  return new ChannelSearchPager(query);
};

/**
 * Gets comments for a content URL
 * @param {string} url Content URL
 * @returns {CommentPager} A pager for comments
 */
source.getComments = function (url) {
  return new MixcloudCommentPager(url);
}

// ====================== CONTENT DETAILS FUNCTIONS ======================

/**
 * Gets details for a regular Mixcloud mix
 * @param {string} url URL of the cloudcast
 * @returns {PlatformVideoDetails} Details about the cloudcast
 */
function getContentDetailsCloudcast(url) {
  const mixMatch = url.match(REGEX.CONTENT_DETAILS_URL);

  if (!mixMatch || !mixMatch[1] || !mixMatch[2]) {
    throw new UnavailableException("Not able to access cloudcast information");
  }

  // Extract username and slug using regex capture groups
  const username = mixMatch[1];
  const slug = mixMatch[2];

  const cloudcastInfo = makeGraphQLRequest("CloudcastLookup", {
    "lookup": {
      "username": username,
      "slug": slug
    }
  });

  if (!cloudcastInfo?.data?.cloudcast) {
    throw new UnavailableException("Cloudcast not found");
  }

  const cloudcast = cloudcastInfo.data.cloudcast;

  const sources = [];

  if (cloudcast?.streamInfo?.hlsDrmUrl) {
    const playlistUrl = cloudcast.streamInfo.hlsDrmUrl.replace("hls_drm/", "hls/");

    sources.push(new HLSSource({
      name: "HLS",
      url: playlistUrl,
      duration: cloudcast.audioLength,
      language: "Unknown",
    }));
  }

  if (!sources.length) {
    throw new UnavailableException("No sources available for cloudcast");
  }

  const platformVideo = cloudcastToPlatformVideo(cloudcast);

  const platformVideoDetails = new PlatformVideoDetails({
    id: platformVideo.id,
    name: platformVideo.name,
    description: platformVideo.description,
    author: platformVideo.author,
    url: platformVideo.url,
    duration: platformVideo.duration,
    thumbnails: platformVideo.thumbnails,
    viewCount: platformVideo.viewCount,
    video: new UnMuxVideoSourceDescriptor([], sources),
    isLive: false,
  });

  platformVideoDetails.getContentRecommendations = function () {

    const moreFromOwner = makeGraphQLRequest("MoreFromOwnerQuery", {
      "lookup": {
        "username": username,
        "slug": slug
      }
    });

    const contentList = [];

    moreFromOwner?.data?.cloudcast?.moreFromOwner?.edges.forEach(edge => {
      if (edge.node.isPlayable) {
        contentList.push(cloudcastToPlatformVideo(edge.node));
      };
    });

    return new ContentPager(contentList, false);
  };

  return platformVideoDetails;
}

/**
 * Gets details for a Mixcloud live stream
 * @param {string} url URL of the live stream
 * @returns {PlatformVideoDetails} Details about the live stream
 */
function getContentDetailsLiveStream(url) {
  const liveMatch = url.match(REGEX.LIVE_STREAM_URL);

  if (!liveMatch || !liveMatch[1]) {
    throw new UnavailableException("Not able to access live stream information");
  }

  // Extract username from live stream URL using regex capture group
  const username = liveMatch[1];

  const liveStreamInfo = makeGraphQLRequest("MobileLiveStreamContainerQuery", {
    lookup: {
      username
    }
  });

  const liveStream = liveStreamInfo?.data?.user?.liveStream ?? null;

  if (!liveStream) {
    throw new UnavailableException("Not able to access live stream");
  }

  const sources = [];

  if (liveStream.hlsUrl) {
    sources.push(new HLSSource({
      name: "HLS",
      url: liveStream.hlsUrl,
      duration: 0
    }));
  }

  if (!sources.length) {
    throw new UnavailableException("No sources available for live stream");
  }

  const platformVideo = liveStreamToPlatformVideo(liveStream);

  return new PlatformVideoDetails({
    id: platformVideo.id,
    name: platformVideo.name,
    description: platformVideo.description,
    author: platformVideo.author,
    url: platformVideo.url,
    viewCount: platformVideo.viewCount,
    thumbnails: platformVideo.thumbnails,
    duration: 0,
    video: new VideoSourceDescriptor(sources),
    isLive: true,
  });
}

// ====================== CONTENT CONVERSION HELPERS ======================

/**
 * Converts a Mixcloud Cloudcast object to a PlatformVideo
 * 
 * @param {Object} cloudcast - The Mixcloud Cloudcast object from API
 * @returns {PlatformVideo} A PlatformVideo representation of the Cloudcast
 */
function cloudcastToPlatformVideo(cloudcast) {

  const thumbnailUrl = cloudcast.picture?.urlRoot ?
    createThumbnailUrl(cloudcast.picture.urlRoot, 600, 600) :
    '';

  // Extract tags from the cloudcast
  const tags = extractTags(cloudcast.tagList);

  // Format publish date
  const publishDate = cloudcast.publishDate ? dateToUnixSeconds(cloudcast.publishDate) : null;

  const authorThumbnailUrl = cloudcast.owner.picture?.urlRoot ?
    createThumbnailUrl(cloudcast.owner.picture.urlRoot, 272, 272) :
    '';

  const description = cloudcast.description || (tags.length ? tags.join(", ") : "");

  // Use channel username if provided (for channel content)
  // This handles cases where the content URL uses a different username than the owner
  const urlUsername = cloudcast._channelUsername || cloudcast.owner.username;

  const contentUrl = cloudcast.url || createMixcloudUrl(urlUsername, cloudcast.slug);

  return new PlatformVideo({
    id: new PlatformID(PLATFORM.name, cloudcast.id, config.id),
    name: cloudcast.name,
    thumbnails: new Thumbnails([new Thumbnail(thumbnailUrl)]),
    author: new PlatformAuthorLink(
      new PlatformID(PLATFORM.name, cloudcast.owner.id, config.id),
      cloudcast.owner.displayName,
      createMixcloudUrl(cloudcast.owner.username),
      authorThumbnailUrl || thumbnailUrl  // Use author thumbnail if available, otherwise use content thumbnail
    ),
    duration: cloudcast.audioLength || 0,
    viewCount: cloudcast.plays || 0,
    url: contentUrl,
    uploadDate: publishDate,
    description: description,
    isLive: false
  });
}

/**
 * Converts a Mixcloud LiveStream object to a PlatformVideo
 * 
 * @param {Object} stream - The Mixcloud LiveStream object from API
 * @returns {PlatformVideo} A PlatformVideo representation of the LiveStream
 */
function liveStreamToPlatformVideo(stream) {

  const thumbnailUrl = stream.thumbnailUrl ?
    createThumbnailUrl(stream.thumbnailUrl, 600, 355) :
    '';

  const authorThumbnailUrl = stream.owner.picture?.urlRoot ?
    createThumbnailUrl(stream.owner.picture.urlRoot, 272, 272) :
    '';

  // Extract tags from the stream
  const tags = extractTags(stream.tagList);

  const contentUrl = createMixcloudUrl(stream.owner.username, null, true);

  return new PlatformVideo({
    id: new PlatformID(PLATFORM.name, stream.id, config.id),
    name: stream.name,
    thumbnails: new Thumbnails([new Thumbnail(thumbnailUrl)]),
    author: new PlatformAuthorLink(
      new PlatformID(PLATFORM.name, stream.owner.id, config.id),
      stream.owner.displayName,
      createMixcloudUrl(stream.owner.username),
      authorThumbnailUrl || thumbnailUrl // Use author thumbnail if available, otherwise use content thumbnail
    ),
    duration: 0, // Live streams don't have a fixed duration
    viewCount: stream.plays,
    uploadDate: parseInt(new Date().getTime() / 1000),
    isLive: true,
    description: tags.length ? tags.join(", ") : "",
    url: contentUrl
  });
}

// ====================== DATA FETCHING ======================

/**
 * Makes a GraphQL request to Mixcloud's API
 * @param {string} queryName Name of the query from GQL_QUERIES
 * @param {Object} variables Variables for the GraphQL query
 * @param {string} operationName Operation name for the GraphQL request
 * @returns {Object|null} Response body or null on error
 */
function makeGraphQLRequest(queryName, variables, operationName) {
  try {
    if (!GQL_QUERIES[queryName]) {
      logError(`Unknown GraphQL query: ${queryName}`);
      return null;
    }

    if (!operationName) {
      operationName = queryName;
    }

    const queryInfo = {
      query: GQL_QUERIES[queryName],
      operationName: operationName,
      variables: variables
    };

    const response = makeRequestWithRetry('POST', URLS.GRAPHQL_URL, JSON.stringify(queryInfo), DEFAULT_REST_HEADERS, { parseResponse: true });

    if (!response.isOk) {
      logError(`GraphQL request failed. Query: ${queryName}, Status: ${response.code}`);
      return null;
    }

    return safeJsonParse(response.body);
  } catch (error) {
    logError(`Exception in makeGraphQLRequest: ${error.message}`);
    return null;
  }
}

/**
 * Makes an HTTP request with automatic retries and error handling
 * 
 * @param {string} method - HTTP method ('GET', 'POST', etc.)
 * @param {string} url - The URL to make the request to
 * @param {string|Object|null} body - Request body for POST/PUT requests
 * @param {Object} headers - HTTP headers for the request
 * @param {Object} options - Additional options
 * @param {boolean} [options.useAuth=false] - Whether to use authentication for the request
 * @param {boolean} [options.parseResponse=false] - Whether to parse the response as JSON
 * @param {number} [options.maxRetries=3] - Maximum number of retry attempts
 * @param {boolean} [options.throwOnError=false] - Whether to throw an exception on error
 * @returns {Object} - Response object with isOk, code, and body properties
 */
function makeRequestWithRetry(method, url, body = null, headers = {}, options = {}) {
  const {
    useAuth = false,
    parseResponse = false,
    maxRetries = 4,
    throwOnError = true
  } = options;

  let remainingAttempts = maxRetries + 1; // +1 for the initial attempt
  let lastResponse = null;
  let lastError = null;

  while (remainingAttempts > 0) {
    try {
      let response;

      // Make the appropriate type of request based on method
      if (method.toUpperCase() === 'GET') {
        // using object spread due to issue on desktop when modifying the object with response.parsedBody
        response = { ...http.GET(url, headers, useAuth) };
      } else if (method.toUpperCase() === 'POST') {
        // using object spread due to issue on desktop when modifying the object with response.parsedBody
        response = { ...http.POST(url, body, headers, useAuth) };
      } else {
        throw new ScriptException(`Unsupported HTTP method: ${method}`);
      }

      // If request was successful, optionally parse the response
      if (response.isOk && parseResponse) {
        try {
          response.parsedBody = JSON.parse(response.body);

          // Check for API error responses that might be in a 200 response
          if (response.parsedBody.errors) {
            const errorMsg = `API returned error: ${JSON.stringify(response.parsedBody.errors)}`;
            logError(errorMsg);
            if (throwOnError) {
              throw new ScriptException(errorMsg);
            }
          }
        } catch (parseError) {
          const errorMsg = `Failed to parse response as JSON: ${parseError.message}`;
          logError(errorMsg);
          if (throwOnError) {
            throw new ScriptException(errorMsg);
          }
        }
      }

      // Return on success
      if (response.isOk) {
        return response;
      }

      // Save the failed response and log the error
      lastResponse = response;
      const errorMsg = `${method} request to ${url} failed with status ${response.code}`;
      logError(`${errorMsg}. Attempts left: ${remainingAttempts - 1}`);

      if (throwOnError) {
        throw new ScriptException(errorMsg);
      }

      remainingAttempts--;

    } catch (error) {
      // Save the error and log it
      lastError = error;
      logError(`Exception in ${method} request to ${url}: ${error.message}. Attempts left: ${remainingAttempts - 1}`);

      if (throwOnError && remainingAttempts <= 1) {
        throw error;
      }

      remainingAttempts--;
    }
  }

  // All retry attempts have failed, return last response or construct a dummy response
  if (lastResponse) {
    return lastResponse;
  }

  // Create a dummy response if we don't have a real one
  return {
    isOk: false,
    code: 0,
    status: 0,
    body: JSON.stringify({ error: lastError ? lastError.message : `${method} request failed after all retry attempts` })
  };
}

// ====================== UTILITY FUNCTIONS ======================

/**
 * Creates a Mixcloud URL for a channel, mix, or live stream
 * @param {string} username The username for the URL
 * @param {string} [slug] Optional slug for a specific mix
 * @param {boolean} [isLive=false] Whether this is a live stream URL
 * @returns {string} The formatted Mixcloud URL
 */
function createMixcloudUrl(username, slug, isLive = false) {
  if (isLive) {
    return `https://www.mixcloud.com/live/${username}/`;
  } else if (slug) {
    return `https://www.mixcloud.com/${username}/${slug}/`;
  } else {
    return `https://www.mixcloud.com/${username}/`;
  }
}

/**
 * Creates a thumbnail URL with specified dimensions
 * @param {string} urlRoot The base URL for the image
 * @param {number} width The desired width
 * @param {number} height The desired height
 * @returns {string} The formatted thumbnail URL
 */
function createThumbnailUrl(urlRoot, width = 600, height = 600) {
  return `https://thumbnailer.mixcloud.com/unsafe/${width}x${height}/${urlRoot}`;
}

/**
 * Extracts tag names from Mixcloud tagList object
 * @param {Object} tagList The tagList object from a Mixcloud API response
 * @returns {Array} Array of tag names
 */
function extractTags(tagList) {
  const tags = [];
  if (tagList?.edges?.length) {
    tagList.edges.forEach(tagEdge => {
      if (tagEdge.node?.name) {
        tags.push(tagEdge.node.name);
      }
    });
  }
  return tags;
}

/**
 * Converts a date string to Unix timestamp in seconds
 * @param {string} date Date string
 * @returns {number|null} Unix timestamp or null if invalid
 */
function dateToUnixSeconds(date) {
  try {
    if (!date) {
      return null;
    }
    return Math.round(Date.parse(date) / 1000);
  } catch (error) {
    logError(`Date conversion error: ${error.message}`);
    return null;
  }
}

/**
 * Safely parses JSON and returns null on error
 * @param {string} jsonString JSON string to parse
 * @returns {Object|null} Parsed object or null on error
 */
function safeJsonParse(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    logError(`JSON parse error: ${error.message}`);
    return null;
  }
}

/**
 * Safely parses an integer with fallback to 0
 * @param {*} value Value to parse
 * @returns {number} Parsed integer or 0 if invalid
 */
function safeParseInt(value) {
  try {
    const parsed = parseInt(value);
    return isNaN(parsed) ? 0 : parsed;
  } catch (error) {
    logError(`Integer parse error: ${error.message}`);
    return 0;
  }
}

/**
 * Checks if a URL matches a given pattern
 * @param {string} url URL to check
 * @param {RegExp} pattern Regular expression pattern
 * @returns {boolean} True if URL matches pattern
 */
function urlMatches(url, pattern) {
  try {
    return pattern.test(url);
  } catch (error) {
    logError(`URL pattern matching error: ${error.message}`);
    return false;
  }
}

/**
 * Creates an empty content pager
 * @returns {ContentPager} Empty pager
 */
function createEmptyPager() {
  return new ContentPager([], false);
}

/**
 * Logs an error message
 * @param {string} message Error message
 */
function logError(message) {
  bridge.log(`[Mix Cloud Plugin] ${message}`);
}

/**
 * Shows a toast message to the user
 * @param {string} message Toast message
 */
function showToast(message) {
  bridge.toast(message);
}

/**
 * Capitalizes the first letter of a string
 * @param {string} string Input string
 * @returns {string} String with first letter capitalized
 */
function capitalizeFirstLetter(string) {
  if (!string) return string; // Handle empty or null strings
  return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
}


function secondsToHMS(seconds) {
  // Calculate hours, minutes, and remaining seconds
  const hours = Math.floor(seconds / 3600);
  const remainingSecondsAfterHours = seconds % 3600;
  const minutes = Math.floor(remainingSecondsAfterHours / 60);
  const remainingSeconds = remainingSecondsAfterHours % 60;

  // Format each component to ensure two digits
  const formattedHours = String(hours).padStart(2, '0');
  const formattedMinutes = String(minutes).padStart(2, '0');
  const formattedSeconds = String(remainingSeconds).padStart(2, '0');

  // Return the formatted string
  return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
}

function isPlatformReserverdUrl(url) {

  if (!url?.trim()) {
    return false;
  }

  // remove fragment
  url = url.split("#")[0];

  if (!url.endsWith("/")) {
    url += "/";
  }

  return RESERVED_URL_LIST.includes(url?.toLowerCase()?.trim());
}

// ====================== CUSTOM PAGER IMPLEMENTATIONS ======================

/**
 * Custom pager implementation for Mixcloud live streams
 */
class LiveStreamPager extends ContentPager {
  /**
   * Creates a new LiveStream pager
   */
  constructor() {
    super([], true);
    this.cursor = null;
    this.hasMore = true;
    if (typeof IS_TESTING !== 'undefined' && IS_TESTING) {
      this.nextPage();
    }
  }

  /**
   * Fetches the next page of results
   * @returns {ContentPager} Pager with the current page results
   */
  nextPage() {
    if (!this.hasMore) {
      return this;
    }

    try {
      const variables = {
        "orderBy": "CURRENT_SPECTATORS",
        "tag": ""
      };

      // Add cursor for pagination if we have one
      if (this.cursor) {
        variables.after = this.cursor;
      }

      const liveStreamInfo = makeGraphQLRequest("LiveListPageQuery", variables);

      // Check if we have valid data
      if (!liveStreamInfo?.data?.viewer?.live?.currentLiveStreams?.edges?.length) {
        this.hasMore = false;
        return this;
      }

      // Extract streams, pagination info
      const edges = liveStreamInfo.data.viewer.live.currentLiveStreams.edges;
      const pageInfo = liveStreamInfo.data.viewer.live.currentLiveStreams.pageInfo;

      // Update cursor and hasNextPage for pagination
      this.cursor = pageInfo.endCursor;
      this.hasMore = pageInfo.hasNextPage;

      // Map each stream to a PlatformVideo using the helper function
      const videos = edges.map(edge => liveStreamToPlatformVideo(edge.node));

      // Update results
      this.results = videos;
      return this;
    } catch (error) {
      logError(`Exception in LiveStreamPager.nextPage: ${error.message}`);
      this.hasMore = false;
      return this;
    }
  }
}

/**
 * Custom pager implementation for channel content
 */
class ChannelContentPager extends ContentPager {
  /**
   * Creates a new channel content pager
   * @param {string} channelId The channel ID
   * @param {string} username The channel username
   * @param {Array} initialData Optional initial data
   */
  constructor(channelId, username, initialData) {
    super([], true);
    this.channelId = channelId;
    this.username = username;
    this.cursor = null;
    this.hasMore = true;
    this.initialData = initialData;
    this.nextPage();
  }

  /**
   * Fetches the next page of results
   * @returns {ContentPager} Pager with the current page results
   */
  nextPage() {
    if (!this.hasMore) {
      return this;
    }

    try {
      const variables = {
        "audioTypes": ["SHOW"],
        "count": 20,
        "orderBy": "LATEST",
        "id": this.channelId
      };

      // Add cursor for pagination if we have one
      if (this.cursor) {
        variables.cursor = this.cursor;
      }

      const channelInfo = makeGraphQLRequest("UserUploadsPagePaginationQuery", variables);

      // Check if we have valid data
      if (!channelInfo?.data?.node?.uploads?.edges?.length && !this.initialData?.length) {
        this.hasMore = false;
        return this;
      }

      // Extract uploads, pagination info
      const edges = channelInfo.data.node.uploads.edges;
      const pageInfo = channelInfo.data.node.uploads.pageInfo;

      // Update cursor and hasNextPage for pagination
      this.cursor = pageInfo.endCursor;
      this.hasMore = pageInfo.hasNextPage;

      if (!this.initialData) {
        this.initialData = [];
      }

      // Map each upload to a PlatformVideo
      edges.forEach(edge => {
        if (edge.node.isPlayable) {
          // Ensure the cloudcast has the correct username for URL generation
          // (Use channel username if needed)
          const cloudcast = edge.node;
          if (this.username && this.username !== cloudcast.owner.username) {
            // Store original username for URL generation
            cloudcast._channelUsername = this.username;
          }

          this.initialData.push(cloudcastToPlatformVideo(cloudcast));
        }
      });

      // Update results
      this.results = this.initialData;

      this.initialData = null;

      return this;
    } catch (error) {
      logError(`Exception in ChannelContentPager.nextPage: ${error.message}`);
      this.hasMore = false;
      return this;
    }
  }
}

/**
 * Custom pager implementation for search results
 */
class SearchPager extends ContentPager {
  /**
   * Creates a new search pager
   * @param {string} query Search query
   */
  constructor(query) {
    super([], true);
    this.query = query;
    this.cursor = null;
    this.hasMore = true;
    this.nextPage();
  }

  /**
   * Fetches the next page of results
   * @returns {ContentPager} Pager with the current page results
   */
  nextPage() {
    if (!this.hasMore) {
      return this;
    }

    try {
      const variables = {
        "count": 20,
        "term": this.query,
        "cursor": this.cursor
      };

      const searchResults = makeGraphQLRequest("SearchResultsCloudcastsQuery", variables);

      if (!searchResults?.data?.viewer?.search?.searchQuery?.cloudcasts?.edges?.length) {
        this.hasMore = false;
        return this;
      }

      // Update pagination information
      const pageInfo = searchResults.data.viewer.search.searchQuery.cloudcasts.pageInfo;
      this.hasMore = pageInfo.hasNextPage;
      this.cursor = pageInfo.endCursor;

      // Map results to platform videos using the helper function
      const videos = searchResults.data.viewer.search.searchQuery.cloudcasts.edges
        .filter(edge => edge.node.isPlayable)
        .map(edge => cloudcastToPlatformVideo(edge.node));

      // Update results
      this.results = videos;

      return this;
    } catch (error) {
      logError(`Exception in SearchPager.nextPage: ${error.message}`);
      this.hasMore = false;
      return this;
    }
  }
}

/**
 * Custom pager implementation for channel search results
 */
class ChannelSearchPager extends ContentPager {
  /**
   * Creates a new channel search pager
   * @param {string} query Search query
   */
  constructor(query) {
    super([], true);
    this.query = query;
    this.cursor = null;
    this.hasMore = true;
    this.nextPage();
  }

  /**
   * Fetches the next page of results
   * @returns {ContentPager} Pager with the current page results
   */
  nextPage() {
    if (!this.hasMore) {
      return this;
    }

    try {
      const variables = {
        "count": 20,
        "dateJoinedAfter": null,
        "isUploader": null,
        "term": this.query,
        "cursor": this.cursor
      };

      const searchResults = makeGraphQLRequest("SearchResultsUsersQuery", variables);

      if (!searchResults?.data?.viewer?.search?.searchQuery?.users?.edges?.length) {
        this.hasMore = false;
        return this;
      }

      // Update pagination information
      const pageInfo = searchResults.data.viewer.search.searchQuery.users.pageInfo;
      this.hasMore = pageInfo.hasNextPage;
      this.cursor = pageInfo.endCursor;

      // Map results to platform channels
      const channels = searchResults.data.viewer.search.searchQuery.users.edges.map(edge => {
        const channel = edge.node;

        return new PlatformChannel({
          id: new PlatformID(PLATFORM.name, channel.id, config.id),
          name: channel.displayName,
          description: channel.biog,
          url: createMixcloudUrl(channel.username),
          thumbnail: channel.picture?.urlRoot ?
            createThumbnailUrl(channel.picture.urlRoot, 272, 272) :
            null,
          banner: channel.coverPicture?.urlRoot ?
            createThumbnailUrl(channel.coverPicture.urlRoot, 1460, 370) :
            null,
          subscribers: channel.followers?.totalCount || 0,
          links: {}
        });
      });

      // Update results
      this.results = channels;

      return this;
    } catch (error) {
      logError(`Exception in ChannelSearchPager.nextPage: ${error.message}`);
      this.hasMore = false;
      return this;
    }
  }
}


/**
 * Custom pager implementation for comments
 */
class MixcloudCommentPager extends CommentPager {
  /**
   * Creates a new comment pager
   * @param {string} url Content URL
   */
  constructor(url) {
    super([], true);
    this.url = url;
    this.hasMore = true;
    this.commentId = null;
    this.nextPage();
  }

  /**
   * Fetches the next page of results
   * @returns {CommentPager} Pager with the current page results
   */
  nextPage() {
    if (!this.hasMore) {
      return this;
    }

    try {
      const mixMatch = this.url.match(REGEX.CONTENT_DETAILS_URL);

      if (!mixMatch || !mixMatch[1] || !mixMatch[2]) {
        throw new UnavailableException("Not able to access comments");
      }

      // Extract username and slug using regex capture groups
      const username = mixMatch[1];
      const slug = mixMatch[2];

      const variables = {
        "lookup": {
          username,
          slug
        }
      };

      // Add comment ID for pagination if we have one
      if (this.commentId) {
        variables.commentId = this.commentId;
      }

      const commentsResponse = makeGraphQLRequest("CloudcastCommentsQuery", variables);

      if (!commentsResponse?.data?.cloudcast?.comments?.edges?.length) {
        this.hasMore = false;
        return this;
      }

      // Extract comments and pagination info
      const edges = commentsResponse.data.cloudcast.comments.edges;
      const pageInfo = commentsResponse.data.cloudcast.comments.pageInfo;

      // Update pagination information
      this.hasMore = pageInfo.hasNextPage;
      if (edges.length > 0) {
        this.commentId = edges[edges.length - 1].node.id;
      }

      // Map comments to platform comments
      const comments = edges.map(edge => {
        const comment = edge.node;
        const user = comment.user;

        // Create replies pager for nested comments if they exist
        let replies = [];
        if (comment?.children?.edges?.length) {
          replies = comment.children.edges.map(childEdge => {
            const childComment = childEdge.node;
            const childUser = childComment.user;

            return new Comment({
              contextUrl: this.url,
              author: new PlatformAuthorLink(
                new PlatformID(PLATFORM.name, childUser.id, config.id),
                childUser.displayName,
                createMixcloudUrl(childUser.username),
                childUser.picture?.urlRoot ? createThumbnailUrl(childUser.picture.urlRoot, 272, 272) : null
              ),
              message: childComment.comment,
              rating: new RatingLikes(childComment.likeCount),
              date: dateToUnixSeconds(childComment.created),
              replyCount: 0
            });
          });
        }

        if (comment.audioPosition) {
          comment.comment = `${secondsToHMS(comment.audioPosition)} - ${comment.comment}`;
        }

        // Create main comment
        const platformComment = new Comment({
          contextUrl: this.url,
          author: new PlatformAuthorLink(
            new PlatformID(PLATFORM.name, user.id, config.id),
            user.displayName,
            createMixcloudUrl(user.username),
            user.picture?.urlRoot ? createThumbnailUrl(user.picture.urlRoot, 272, 272) : null
          ),
          message: comment.comment,
          date: dateToUnixSeconds(comment.created),
          replyCount: comment?.children?.edges?.length ?? 0,
          rating: new RatingLikes(comment.likeCount),
        });

        // Add reply functionality if needed
        if (replies.length > 0) {
          platformComment.getReplies = function () {
            return new CommentPager(replies, false);
          };
        }

        return platformComment;
      });

      // Update results
      this.results = comments;
      return this;
    } catch (error) {
      logError(`Exception in CommentPager.nextPage: ${error.message}`);
      this.hasMore = false;
      return this;
    }
  }
}

// ====================== GRAPHQL QUERIES ======================

const GQL_QUERIES = {
  MobileLiveStreamContainerQuery: `
query MobileLiveStreamContainerQuery($lookup: UserLookup!) {
	viewer {
		...MobileLiveStream_viewer
		id
	}
	user: userLookup(lookup: $lookup) {
		liveStream(isPublic: false) {
			...MobileLiveStream_liveStream
			id
		}
		...useLiveSubscriptions_user
		id
	}
}

fragment ImageUser_user on User {
	picture {
		urlRoot
		primaryColor
	}
	displayName
}

fragment LiveVideoElement_liveStream on LiveStream {
	id
	name
	streamStatus
	hlsUrl
	thumbnailUrl
	
}

fragment LiveVideoPlayer_liveStream on LiveStream {
	streamStatus
	...LiveVideoElement_liveStream
	...StreamStatusOverlay_liveStream
}

fragment MobileFollowButtonContainer_user on User {
	id
	isFollowing
}

fragment MobileFollowButtonContainer_viewer on Viewer {
	me {
		id
	}
}

fragment MobileLiveStreamMetadata_liveStream on LiveStream {
	name
	description
	plays
	currentSpectators
	isUnlisted
	owner {
		username
		displayName
		isSelect
		isViewer
		...ImageUser_user
		...MobileFollowButtonContainer_user
		id
	}
	secondaryTags {
		name
		id
	}
}

fragment MobileLiveStreamMetadata_viewer on Viewer {
	me {
		isStaff
		id
	}
	...MobileFollowButtonContainer_viewer
}

fragment MobileLiveStream_liveStream on LiveStream {
	slug
	streamStatus
	owner {
		isViewer
		id
	}
	...LiveVideoPlayer_liveStream
	...MobileLiveStreamMetadata_liveStream
}

fragment MobileLiveStream_viewer on Viewer {
	me {
		__typename
		id
	}
	...MobileLiveStreamMetadata_viewer
}

fragment StreamStatusOverlay_liveStream on LiveStream {
	streamStatus
	owner {
		isViewer
		id
	}
}

fragment useLiveSubscriptions_user on User {
	id
	liveStream(isPublic: false) {
		id
	}
}`,
  LiveListPageQuery: `
query LiveListPageQuery($orderBy: LiveStreamsOrderByEnum!, $tag: String, $after: String) {
	viewer {
		live {
			id
			currentLiveStreams(first: 20, orderBy: $orderBy, tag: $tag, after: $after) {
				edges {
					node {
						name
						plays
						thumbnailUrl
						owner {
							username
							displayName
							picture {
								urlRoot
								primaryColor
							}
							id
						}
						tagList(first: 10, country: "GLOBAL") {
							edges {
								node {
									name
									slug
									id
								}
							}
						}
						id
						__typename
					}
					cursor
				}
				totalCount
				pageInfo {
					endCursor
					hasNextPage
				}
			}
		}
		id
	}
}`,
  ProfileQuery: `
query ProfileQuery(
  $lookup: UserLookup!
  $maxHighlightCount: Int!
  $showsAudioTypes: [AudioTypeEnum]
  $tracksAudioTypes: [AudioTypeEnum]
  $streamAudioTypes: [AudioTypeEnum]
) {
  user: userLookup(lookup: $lookup) {
    isViewer
    city
    country
    hasCoverPicture
    coverPicture {
      urlRoot
    }
    biog
    isTippable
    isSelect
    customLinks: customProfileLinks {
      title
      url
    }
    ...Avatar_user
    ...LimitsCountBanner_user
    ...SocialLinks_user
    ...PercentageComplete_user
    ...MoreOptions_user
    ...ProfileNavigationContainer_user
    ...AffiliateBadge_user
    ...ShareAudioCardList_user
    ...UserLiveCard_user
    ...UserHighlighted_user_2Nv31H
    ...ProfileFollowButton_user
    id
  }
  viewer {
    ...UserHighlighted_viewer
    ...MoreOptions_viewer
    ...ProfileFollowButton_viewer
    id
  }
}

fragment Actions_cloudcast on Cloudcast {
  audioType
  ...CardFavoriteButton_cloudcast
  ...CardShareButton_cloudcast
  ...CardAddToButton_cloudcast
  ...CardHighlightButton_cloudcast
  ...CardBoostButton_cloudcast
  ...CardStats_cloudcast
  ...CardMoreOptions_cloudcast
  ...CardPlayButton_cloudcast
  ...DisappearingTags_taggableInterface
}

fragment Actions_viewer on Viewer {
  ...CardFavoriteButton_viewer
  ...CardHighlightButton_viewer
  ...CardMoreOptions_viewer
}

fragment AffiliateBadge_user on User {
  affiliations(first: 25) {
    edges {
      node {
        username
        displayName
        ...ImageUser_user
        ...Hovercard_user
        id
      }
    }
  }
}

fragment Artwork_cloudcast on Cloudcast {
  slug
  audioQuality
  qualityScore
  listenerMinutes
  isPublic
  owner {
    username
    id
  }
  ...ImageCloudcast_cloudcast
}

fragment Artwork_user on User {
  isStaff
}

fragment AudioCard_cloudcast on Cloudcast {
  audioType
  isAwaitingAudio
  isDraft
  ...CardDetails_cloudcast
  ...DisappearingTags_taggableInterface
  ...StatusOrActions_cloudcast
  ...Artwork_cloudcast
  ...Waveform_cloudcast
}

fragment AudioCard_viewer on Viewer {
  ...StatusOrActions_viewer
  me {
    ...Artwork_user
    uploadLimits {
      tracksPublishRemaining
      showsPublishRemaining
    }
    id
  }
}

fragment Avatar_user on User {
  hasProFeatures
  hasPremiumFeatures
  isStaff
  username
  displayName
  hasCoverPicture
  isViewer
  coverPicture {
    urlRoot
  }
  followers {
    totalCount
  }
  followings {
    totalCount
  }
  ...ImageUser_user
}

fragment CardAddToButton_cloudcast on Cloudcast {
  id
  isUnlisted
  isPublic
}

fragment CardBoostButton_cloudcast on Cloudcast {
  id
  isPublic
  owner {
    id
    isViewer
  }
}

fragment CardDetails_cloudcast on Cloudcast {
  slug
  name
  isDraft
  isExclusive
  publishDate
  audioType
  owner {
    username
    id
  }
  creatorAttributions(first: 2) {
    totalCount
  }
  ...Owners_cloudcast
  ...CardPlayButton_cloudcast
  ...ExclusiveCloudcastBadgeContainer_cloudcast
}

fragment CardFavoriteButton_cloudcast on Cloudcast {
  id
  isFavorited
  isPublic
  hiddenStats
  favorites {
    totalCount
  }
  slug
  owner {
    id
    isFollowing
    username
    displayName
  }
}

fragment CardFavoriteButton_viewer on Viewer {
  me {
    id
  }
}

fragment CardHighlightButton_cloudcast on Cloudcast {
  id
  isPublic
  isHighlighted
  owner {
    isViewer
    id
  }
}

fragment CardHighlightButton_viewer on Viewer {
  me {
    id
    hasProFeatures
    highlighted {
      totalCount
    }
  }
}

fragment CardMoreOptions_cloudcast on Cloudcast {
  id
  isPublic
  slug
  isUnlisted
  isScheduled
  isDraft
  audioType
  isDisabledCopyright
  viewerAttribution {
    status
    id
  }
  viewerAttributionRequest {
    id
  }
  creatorAttributions(first: 2) {
    totalCount
  }
  owner {
    id
    username
    isViewer
    viewerIsAffiliate
    displayName
  }
}

fragment CardMoreOptions_viewer on Viewer {
  me {
    id
    hasProFeatures
    uploadLimits {
      tracksPublishRemaining
      showsPublishRemaining
    }
  }
}

fragment CardPlayButton_cloudcast on Cloudcast {
  id
  restrictedReason
  proportionListened
  owner {
    isSubscribedTo
    isViewer
    id
  }
  isAwaitingAudio
  isDraft
  isPlayable
  currentPosition
  ...playbackPositionCloudcastFragment
  previewUrl
  isExclusive
  isDisabledCopyright
  ...CardStaticPlayButton_cloudcast
  ...useAudioPreview_cloudcast
  ...usePlayWithRestrictions_cloudcast
}

fragment CardShareButton_cloudcast on Cloudcast {
  id
  isUnlisted
  isPublic
  slug
  description
  audioType
  picture {
    urlRoot
  }
  owner {
    displayName
    isViewer
    username
    id
  }
}

fragment CardStaticPlayButton_cloudcast on Cloudcast {
  owner {
    username
    id
  }
  slug
  id
  restrictedReason
}

fragment CardStats_cloudcast on Cloudcast {
  isDraft
  hiddenStats
  plays
  audioLength
}

fragment CopyrightSupport_cloudcast on Cloudcast {
  slug
  name
  owner {
    username
    id
  }
}

fragment DisappearingTags_taggableInterface on TaggableInterface {
  __isTaggableInterface: __typename
  tagList(first: 10, country: "GLOBAL") {
    edges {
      node {
        name
        slug
        id
      }
    }
  }
}

fragment DropdownProfileNavigation_dropdownMenuItems on NavigationItemInterface {
  __isNavigationItemInterface: __typename
  ...dropdownMenuProfileNavigation_menuItems
}

fragment DropdownProfileNavigation_user on User {
  ...dropdownMenuProfileNavigation_user
}

fragment Duration_cloudcast on Cloudcast {
  audioType
  audioLength
  picture {
    isLight
    primaryColor
    darkPrimaryColor: primaryColor(darken: 60)
  }
}

fragment ExclusiveCloudcastBadgeContainer_cloudcast on Cloudcast {
  isExclusive
  isExclusivePreviewOnly
  slug
  id
  owner {
    username
    id
  }
}

fragment FixedProfileHeader_user on User {
  displayName
  hasProFeatures
  hasPremiumFeatures
  isStaff
  ...ProfileNavigation_user
  ...UserBadge_user
  ...ImageUser_user
}

fragment Hovercard_user on User {
  id
}

fragment ImageCloudcast_cloudcast on Cloudcast {
  name
  picture {
    urlRoot
    primaryColor
  }
}

fragment ImageLiveStream_liveStream on LiveStream {
  name
  thumbnailUrl
}

fragment ImageUser_user on User {
  picture {
    urlRoot
    primaryColor
  }
  displayName
}

fragment InnerListProfileNavigation_dropdownMenuItems on NavigationItemInterface {
  __isNavigationItemInterface: __typename
  ...DropdownProfileNavigation_dropdownMenuItems
}

fragment InnerListProfileNavigation_subNavMenuItems on CountableNavigationItemInterface {
  __isCountableNavigationItemInterface: __typename
  ...MenuItemProfileNavigation_menuItem
}

fragment InnerListProfileNavigation_user on User {
  ...MenuItem_user
  ...DropdownProfileNavigation_user
}

fragment LimitsCountBanner_user on User {
  hasProFeatures
  uploadLimits {
    tracksPublishRemaining
    showsPublishRemaining
  }
  draftShows: drafts(audioTypes: [SHOW]) {
    totalCount
  }
  draftTracks: drafts(audioTypes: [TRACK]) {
    totalCount
  }
}

fragment LiveCard_liveStream on LiveStream {
  name
  plays
  thumbnailUrl
  owner {
    username
    displayName
    ...ImageUser_user
    ...Hovercard_user
    id
  }
  ...DisappearingTags_taggableInterface
  ...ImageLiveStream_liveStream
}

fragment MenuItemProfileNavigation_menuItem on CountableNavigationItemInterface {
  __isCountableNavigationItemInterface: __typename
  __typename
  count
  ... on HideableNavigationItemInterface {
    __isHideableNavigationItemInterface: __typename
    hidden
  }
  ... on PlaylistNavigationItem {
    playlist {
      name
      slug
      id
    }
  }
}

fragment MenuItem_user on User {
  username
}

fragment MoreOptions_user on User {
  id
  isBlocked
  isSpam
  isViewer
}

fragment MoreOptions_viewer on Viewer {
  me {
    __typename
    id
  }
}

fragment Owners_cloudcast on Cloudcast {
  owner {
    ...Username_user
    id
  }
  creatorAttributions(first: 2) {
    totalCount
    edges {
      node {
        ...Username_user
        id
      }
    }
  }
}

fragment PercentageComplete_user on User {
  isViewer
  percentageComplete
}

fragment ProfileFollowButton_user on User {
  id
  isFollowing
  username
  isViewer
  ...ProfileFollowingButton_user
}

fragment ProfileFollowButton_viewer on Viewer {
  me {
    id
  }
  ...ProfileFollowingButton_viewer
}

fragment ProfileFollowingButton_user on User {
  id
  receivesUploadNotifications
  displayName
}

fragment ProfileFollowingButton_viewer on Viewer {
  settings {
    disableEmail
    emailNotifications {
      newUpload
    }
  }
}

fragment ProfileNavigationContainer_user on User {
  ...FixedProfileHeader_user
  ...ProfileNavigation_user
}

fragment ProfileNavigation_user on User {
  id
  profileNavigation(showsAudioTypes: $showsAudioTypes, tracksAudioTypes: $tracksAudioTypes, streamAudioTypes: $streamAudioTypes) {
    menuItems {
      __typename
      ... on NavigationItemInterface {
        __isNavigationItemInterface: __typename
        inDropdown
      }
      ... on PlaylistNavigationItem {
        inDropdown
      }
      ...activePlaylist_menuItem
      ...InnerListProfileNavigation_dropdownMenuItems
      ...InnerListProfileNavigation_subNavMenuItems
    }
  }
  ...InnerListProfileNavigation_user
}

fragment ShareAudioCardList_user on User {
  biog
  username
  displayName
  id
  isUploader
  picture {
    urlRoot
  }
}

fragment SocialLinks_user on User {
  displayName
  isViewer
  twitterAccount {
    username
  }
  socialMediaLinks {
    deeplink
    link
    platform
  }
}

fragment StatusOrActions_cloudcast on Cloudcast {
  slug
  publishDate
  audioType
  isAwaitingAudio
  isDraft
  isScheduled
  isLiveRecording
  isDisabledCopyright
  restrictedReason
  owner {
    username
    isViewer
    id
  }
  ...CopyrightSupport_cloudcast
  ...Actions_cloudcast
  ...CardMoreOptions_cloudcast
}

fragment StatusOrActions_viewer on Viewer {
  me {
    uploadLimits {
      tracksPublishRemaining
      showsPublishRemaining
    }
    id
  }
  ...Actions_viewer
  ...CardMoreOptions_viewer
}

fragment UserBadge_user on User {
  hasProFeatures
  isStaff
  hasPremiumFeatures
}

fragment UserHighlighted_user_2Nv31H on User {
  id
  displayName
  highlighted(first: $maxHighlightCount) {
    edges {
      node {
        ...AudioCard_cloudcast
        id
      }
    }
  }
  ...ShareAudioCardList_user
}

fragment UserHighlighted_viewer on Viewer {
  ...AudioCard_viewer
}

fragment UserLiveCard_user on User {
  liveStream {
    streamStatus
    ...LiveCard_liveStream
    id
  }
}

fragment Username_user on User {
  username
  displayName
  ...UserBadge_user
  ...Hovercard_user
}

fragment WaveformDataFragment on Cloudcast {
  waveformUrl
}

fragment WaveformPath_cloudcast_3lzM42 on Cloudcast {
  id
  audioLength
  ...isNowPlayingCloudcastFragment
  ...playbackPositionCloudcastFragment
  isPlayable
  restrictedReason
  seekRestriction
  ...WaveformDataFragment
  ...hasAudioCloudcastFragment_3lzM42
  ...usePlayerSlider_cloudcast_4vCdM7
}

fragment Waveform_cloudcast on Cloudcast {
  id
  owner {
    username
    id
  }
  slug
  ...WaveformPath_cloudcast_3lzM42
  ...Duration_cloudcast
}

fragment activePlaylist_menuItem on NavigationItemInterface {
  __isNavigationItemInterface: __typename
  __typename
  ... on PlaylistNavigationItem {
    playlist {
      __typename
      id
    }
  }
}

fragment dropdownMenuProfileNavigation_menuItems on CountableNavigationItemInterface {
  __isCountableNavigationItemInterface: __typename
  ...MenuItemProfileNavigation_menuItem
}

fragment dropdownMenuProfileNavigation_user on User {
  ...MenuItem_user
}

fragment hasAudioCloudcastFragment_3lzM42 on Cloudcast {
  streamInfo(timestamper: false) {
    __typename
  }
}

fragment isNowPlayingCloudcastFragment on Cloudcast {
  id
}

fragment playbackPositionCloudcastFragment on Cloudcast {
  id
  currentPosition
}

fragment useAudioPreview_cloudcast on Cloudcast {
  id
  previewUrl
}

fragment useExclusiveCloudcastModal_cloudcast on Cloudcast {
  id
  isExclusive
  owner {
    username
    id
  }
}

fragment useExclusivePreviewModal_cloudcast on Cloudcast {
  id
  isExclusivePreviewOnly
  owner {
    username
    id
  }
}

fragment usePlayWithRestrictions_cloudcast on Cloudcast {
  id
  owner {
    isSubscribedTo
    isViewer
    id
  }
  isPlayable
  ...hasAudioCloudcastFragment_3lzM42
  currentPosition
  repeatPlayAmount
  hasPlayCompleted
  seekRestriction
  isExclusive
  ...useExclusivePreviewModal_cloudcast
  ...useExclusiveCloudcastModal_cloudcast
}

fragment usePlayerSlider_cloudcast_4vCdM7 on Cloudcast {
  seekRestriction
  audioLength
  isExclusive
  owner {
    isSubscribedTo
    isViewer
    id
  }
}
`,
  UserUploadsPagePaginationQuery: `
query UserUploadsPagePaginationQuery(
	$audioTypes: [AudioTypeEnum] = [SHOW]
	$count: Int = 20
	$cursor: String
	$onlyAttributedTo: ID
	$orderBy: CloudcastOrderByEnum = LATEST
	$id: ID!
) {
	node(id: $id) {
		__typename
		...UserUploadsPage_user_2uzeCj
		id
	}
}

fragment Actions_cloudcast on Cloudcast {
	audioType
	...CardFavoriteButton_cloudcast
	...CardShareButton_cloudcast
	...CardAddToButton_cloudcast
	...CardHighlightButton_cloudcast
	...CardBoostButton_cloudcast
	...CardStats_cloudcast
	...CardMoreOptions_cloudcast
	...CardPlayButton_cloudcast
	...DisappearingTags_taggableInterface
}

fragment Artwork_cloudcast on Cloudcast {
	slug
  url
	audioQuality
	qualityScore
	listenerMinutes
	isPublic
	owner {
		username
		id
    picture {
      urlRoot
    }
	}
	...ImageCloudcast_cloudcast
}

fragment AudioCard_cloudcast on Cloudcast {
	audioType
	isAwaitingAudio
	isDraft
	...CardDetails_cloudcast
	...DisappearingTags_taggableInterface
	...StatusOrActions_cloudcast
	...Artwork_cloudcast
	...Waveform_cloudcast
}

fragment CardAddToButton_cloudcast on Cloudcast {
	id
	isUnlisted
	isPublic
}

fragment CardBoostButton_cloudcast on Cloudcast {
	id
	isPublic
	owner {
		id
		isViewer
	}
}

fragment CardDetails_cloudcast on Cloudcast {
	slug
	name
	isDraft
	isExclusive
	publishDate
	audioType
	owner {
		username
		id
	}
	creatorAttributions(first: 2) {
		totalCount
	}
	...Owners_cloudcast
	...CardPlayButton_cloudcast
	...ExclusiveCloudcastBadgeContainer_cloudcast
}

fragment CardFavoriteButton_cloudcast on Cloudcast {
	id
	isFavorited
	isPublic
	hiddenStats
	favorites {
		totalCount
	}
	slug
	owner {
		id
		isFollowing
		username
		displayName
	}
}

fragment CardHighlightButton_cloudcast on Cloudcast {
	id
	isPublic
	isHighlighted
	owner {
		isViewer
		id
	}
}

fragment CardMoreOptions_cloudcast on Cloudcast {
	id
	isPublic
	slug
	isUnlisted
	isScheduled
	isDraft
	audioType
	isDisabledCopyright
	viewerAttribution {
		status
		id
	}
	viewerAttributionRequest {
		id
	}
	creatorAttributions(first: 2) {
		totalCount
	}
	owner {
		id
		username
		isViewer
		viewerIsAffiliate
		displayName
	}
}

fragment CardPlayButton_cloudcast on Cloudcast {
	id
	restrictedReason
	proportionListened
	owner {
		isSubscribedTo
		isViewer
		id
	}
	isAwaitingAudio
	isDraft
	isPlayable
	currentPosition
	...playbackPositionCloudcastFragment
	previewUrl
	isExclusive
	isDisabledCopyright
	...CardStaticPlayButton_cloudcast
	...useAudioPreview_cloudcast
	...usePlayWithRestrictions_cloudcast
}

fragment CardShareButton_cloudcast on Cloudcast {
	id
	isUnlisted
	isPublic
	slug
	description
	audioType
	picture {
		urlRoot
	}
	owner {
		displayName
		isViewer
		username
		id
	}
}

fragment CardStaticPlayButton_cloudcast on Cloudcast {
	owner {
		username
		id
	}
	slug
	id
	restrictedReason
}

fragment CardStats_cloudcast on Cloudcast {
	isDraft
	hiddenStats
	plays
	audioLength
}

fragment CopyrightSupport_cloudcast on Cloudcast {
	slug
	name
	owner {
		username
		id
	}
}

fragment DisappearingTags_taggableInterface on TaggableInterface {
	__isTaggableInterface: __typename
	tagList(first: 10, country: "GLOBAL") {
		edges {
			node {
				name
				slug
				id
			}
		}
	}
}

fragment Duration_cloudcast on Cloudcast {
	audioType
	audioLength
	picture {
		isLight
		primaryColor
		darkPrimaryColor: primaryColor(darken: 60)
	}
}

fragment ExclusiveCloudcastBadgeContainer_cloudcast on Cloudcast {
	isExclusive
	isExclusivePreviewOnly
	slug
	id
	owner {
		username
		id
	}
}

fragment Hovercard_user on User {
	id
}

fragment ImageCloudcast_cloudcast on Cloudcast {
	name
	picture {
		urlRoot
		primaryColor
	}
}

fragment Owners_cloudcast on Cloudcast {
	owner {
		...Username_user
		id
	}
	creatorAttributions(first: 2) {
		totalCount
		edges {
			node {
				...Username_user
				id
			}
		}
	}
}

fragment ShareAudioCardList_user on User {
	biog
	username
	displayName
	id
	isUploader
	picture {
		urlRoot
	}
}

fragment StatusOrActions_cloudcast on Cloudcast {
	slug
	publishDate
	audioType
	isAwaitingAudio
	isDraft
	isScheduled
	isLiveRecording
	isDisabledCopyright
	restrictedReason
	owner {
		username
		isViewer
		id
	}
	...CopyrightSupport_cloudcast
	...Actions_cloudcast
	...CardMoreOptions_cloudcast
}

fragment UserBadge_user on User {
	hasProFeatures
	isStaff
	hasPremiumFeatures
}

fragment UserUploadsPage_user_2uzeCj on User {
	id
	displayName
	username
	isViewer
	hasProFeatures
	viewerIsAffiliate
	...ShareAudioCardList_user
	uploads(
		first: $count
		isPublic: true
		after: $cursor
		orderBy: $orderBy
		audioTypes: $audioTypes
		onlyAttributedTo: $onlyAttributedTo
	) {
		edges {
			node {
				...AudioCard_cloudcast
				id
				__typename
			}
			cursor
		}
		pageInfo {
			endCursor
			hasNextPage
		}
	}
}

fragment Username_user on User {
	username
	displayName
	...UserBadge_user
	...Hovercard_user
}

fragment WaveformDataFragment on Cloudcast {
	waveformUrl
}

fragment WaveformPath_cloudcast_3lzM42 on Cloudcast {
	id
	audioLength
	...isNowPlayingCloudcastFragment
	...playbackPositionCloudcastFragment
	isPlayable
	restrictedReason
	seekRestriction
	...WaveformDataFragment
	...hasAudioCloudcastFragment_3lzM42
	...usePlayerSlider_cloudcast_4vCdM7
}

fragment Waveform_cloudcast on Cloudcast {
	id
	owner {
		username
		id
	}
	slug
	...WaveformPath_cloudcast_3lzM42
	...Duration_cloudcast
}

fragment hasAudioCloudcastFragment_3lzM42 on Cloudcast {
	streamInfo(timestamper: false) {
		__typename
	}
}

fragment isNowPlayingCloudcastFragment on Cloudcast {
	id
}

fragment playbackPositionCloudcastFragment on Cloudcast {
	id
	currentPosition
}

fragment useAudioPreview_cloudcast on Cloudcast {
	id
	previewUrl
}

fragment useExclusiveCloudcastModal_cloudcast on Cloudcast {
	id
	isExclusive
	owner {
		username
		id
	}
}

fragment useExclusivePreviewModal_cloudcast on Cloudcast {
	id
	isExclusivePreviewOnly
	owner {
		username
		id
	}
}

fragment usePlayWithRestrictions_cloudcast on Cloudcast {
	id
	owner {
		isSubscribedTo
		isViewer
		id
	}
	isPlayable
	...hasAudioCloudcastFragment_3lzM42
	currentPosition
	repeatPlayAmount
	hasPlayCompleted
	seekRestriction
	isExclusive
	...useExclusivePreviewModal_cloudcast
	...useExclusiveCloudcastModal_cloudcast
}

fragment usePlayerSlider_cloudcast_4vCdM7 on Cloudcast {
	seekRestriction
	audioLength
	isExclusive
	owner {
		isSubscribedTo
		isViewer
		id
	}
}

`,
  ChannelInfoByUsername: `
query ChannelInfoByUsername($lookup: UserLookup!) {
	user: userLookup(lookup: $lookup) {
		id
		displayName
		biog
		isViewer
		city
		country
		hasCoverPicture
		hasPicture
		url
		liveStream {
			id
			name
			streamStatus
			hlsUrl
			thumbnailUrl
			slug
			owner {
				isViewer
				id
			}
		}
		picture {
			urlRoot
		}
		coverPicture {
			urlRoot
		}
		socialMediaLinks {
			platform
			deeplink
		}
		customLinks: customProfileLinks {
			title
			url
		}
		followers {
			totalCount
		}
	}
}

`,
  CloudcastLookup: `
query CloudcastLookup($lookup: CloudcastLookup!) {
	cloudcast: cloudcastLookup(lookup: $lookup) {
		id
    name
		slug
		isUnlisted
		isShortLength
		audioType
		audioLength
		description
		url
    plays
    publishDate
		streamInfo(timestamper: false) {
			url
			hlsUrl
			dashDrmUrl
			hlsDrmUrl
		}
		owner {
			hasProFeatures
			username
			isBranded
			displayName
			isViewer
			id
			url
			picture {
				urlRoot
			}
		}
		picture {
			urlRoot
		}
		viewerAttribution {
			id
		}
	}
}

`,
  SearchResultsUsersQuery: `
query SearchResultsUsersQuery(
	$count: Int = 5
	$cursor: String
	$dateJoinedAfter: DateJoinedAfterFilter
	$isUploader: IsUploaderFilter
	$term: String!
) {
	viewer {
		...SearchResultsUsers_viewer_4die2G
		id
	}
}
fragment Hovercard_user on User {
	id
}
fragment ImageUser_user on User {
	picture {
		urlRoot
		primaryColor
	}
	displayName
}
fragment ItemUserCardList_user on User {
	isViewer
	...RebrandUserCard_user
}
fragment ItemUserCardList_viewer on Viewer {
	...RebrandUserCard_viewer
}
fragment RebrandFollowButton_user on User {
	id
	isFollowed
	isFollowing
	isViewer
	username
	displayName
}
fragment RebrandFollowButton_viewer on Viewer {
	me {
		id
	}
}
fragment RebrandUserCardDisplayName_user on User {
	displayName
	username
}
fragment RebrandUserCardUserImage_user on User {
	username
	...ImageUser_user
}
fragment RebrandUserCard_user on User {
	id
	displayName
	username
  picture {
    urlRoot
  }
	...UsercardFollowerCount_user
	...ImageUser_user
	...Hovercard_user
	...RebrandFollowButton_user
	...UserBadge_user
	...RebrandUserCardDisplayName_user
	...RebrandUserCardUserImage_user
}
fragment RebrandUserCard_viewer on Viewer {
	id
	...RebrandFollowButton_viewer
}
fragment SearchResultsUsers_viewer_4die2G on Viewer {
	search {
		searchQuery(term: $term) {
			users(
				first: $count
				after: $cursor
				dateJoinedAfter: $dateJoinedAfter
				isUploader: $isUploader
			) {
				edges {
					...UserCardList_userEdges
					cursor
					node {
						__typename
						id
						biog
					}
				}
				pageInfo {
					endCursor
					hasNextPage
				}
			}
		}
	}
	...UserCardList_viewer
}
fragment UserBadge_user on User {
	hasProFeatures
	isStaff
	hasPremiumFeatures
}
fragment UserCardList_userEdges on UserEdgeInterface {
	__isUserEdgeInterface: __typename
	node {
		...ItemUserCardList_user
		id
	}
}
fragment UserCardList_viewer on Viewer {
	...ItemUserCardList_viewer
}
fragment UsercardFollowerCount_user on User {
	followers {
		totalCount
	}
}


`,
  SearchResultsCloudcastsQuery: `
query SearchResultsCloudcastsQuery(
	$count: Int = 10
	$createdAfter: CreatedAfterFilter
	$cursor: String
	$isTimestamped: IsTimestampedFilter
	$term: String!
) {
	viewer {
		...SearchResultsCloudcasts_viewer_4jbhrQ
		id
	}
}

fragment AttributionRequestButton_cloudcast on Cloudcast {
	id
	viewerCanRequestAttribution
	owner {
		hasProFeatures
      picture {
    urlRoot
  }
		id
	}
	viewerAttribution {
		id
	}
	viewerAttributionRequest {
		id
	}
	creatorAttributions(first: 2) {
		edges {
			__typename
		}
	}
}

fragment AudioCardDetails_cloudcast on Cloudcast {
	audioLength
	plays
	publishDate
	tags(country: "GLOBAL") {
		...AudioCardTagsPreviewer_tag
	}
	...AudioCardTags_cloudcast
}

fragment AudioCardTagsPreviewer_tag on CloudcastTag {
	tag {
		name
		slug
		id
	}
}

fragment AudioCardTags_cloudcast on Cloudcast {
	tags(country: "GLOBAL") {
		tag {
			name
			slug
			id
		}
	}
}

fragment ImageCloudcast_cloudcast on Cloudcast {
	name
	picture {
		urlRoot
		primaryColor
	}
}

fragment ItemSearchAudioCardListCloudcast_cloudcast on Cloudcast {
	id
	...SearchAudioCard_cloudcast
}

fragment ItemSearchAudioCardListUser_cloudcast on Cloudcast {
	id
	...SearchAudioCard_cloudcast
}

fragment PlayButton_cloudcast on Cloudcast {
	restrictedReason
	owner {
		isSubscribedTo
		isViewer
		id
	}
	id
	isDraft
	isPlayable
	...hasAudioCloudcastFragment_3lzM42
	currentPosition
	proportionListened
	previewUrl
	isExclusive
	...StaticPlayButton_cloudcast
	...useAudioPreview_cloudcast
	...usePlayWithRestrictions_cloudcast
}

fragment SearchAudioCardList_edges on CloudcastEdgeInterface {
	__isCloudcastEdgeInterface: __typename
	node {
		...ItemSearchAudioCardListCloudcast_cloudcast
		...ItemSearchAudioCardListUser_cloudcast
		id
	}
}

fragment SearchAudioCard_cloudcast on Cloudcast {
	name
	slug
  url
	isExclusive
	owner {
		displayName
		username
		...UserBadge_user
		id
	}
	...ImageCloudcast_cloudcast
	...AudioCardDetails_cloudcast
	...PlayButton_cloudcast
	...AttributionRequestButton_cloudcast
}

fragment SearchResultsCloudcasts_viewer_4jbhrQ on Viewer {
	search {
		searchQuery(term: $term) {
			cloudcasts(
				first: $count
				after: $cursor
				createdAfter: $createdAfter
				isTimestamped: $isTimestamped
			) {
				edges {
					...SearchAudioCardList_edges
					cursor
					node {
						__typename
						id
					}
				}
				pageInfo {
					endCursor
					hasNextPage
				}
			}
		}
	}
}

fragment StaticPlayButton_cloudcast on Cloudcast {
	owner {
		username
		id
	}
	slug
	isAwaitingAudio
	restrictedReason
}

fragment UserBadge_user on User {
	hasProFeatures
	isStaff
	hasPremiumFeatures
}

fragment hasAudioCloudcastFragment_3lzM42 on Cloudcast {
	streamInfo(timestamper: false) {
		__typename
	}
}

fragment useAudioPreview_cloudcast on Cloudcast {
	id
	previewUrl
}

fragment useExclusiveCloudcastModal_cloudcast on Cloudcast {
	id
	isExclusive
	owner {
		username
		id
	}
}

fragment useExclusivePreviewModal_cloudcast on Cloudcast {
	id
	isExclusivePreviewOnly
	owner {
		username
		id
	}
}

fragment usePlayWithRestrictions_cloudcast on Cloudcast {
	id
	owner {
		isSubscribedTo
		isViewer
		id
	}
	isPlayable
	...hasAudioCloudcastFragment_3lzM42
	currentPosition
	repeatPlayAmount
	hasPlayCompleted
	seekRestriction
	isExclusive
	...useExclusivePreviewModal_cloudcast
	...useExclusiveCloudcastModal_cloudcast
}

`,
  CloudcastCommentsQuery: `
query CloudcastCommentsQuery(
  $lookup: CloudcastLookup!
  $commentId: ID
) {
  cloudcast: cloudcastLookup(lookup: $lookup) {
    ...CloudcastComments_cloudcast_4wMsyD
    id
  }
  viewer {
    ...CloudcastComments_viewer
    id
  }
}

fragment CloudcastCommentForm_cloudcast on Cloudcast {
  __typename
  id
  restrictedReason
  owner {
    isViewer
    id
  }
  ...playbackPositionCloudcastFragment
  ...useCreateComment_commentObject
}

fragment CloudcastCommentForm_viewer on Viewer {
  ...CommentForm_viewer
}

fragment CloudcastCommentTime_comment on Comment {
  audioPosition
  commentObject {
    __typename
    ... on Cloudcast {
      id
      ...isNowPlayingCloudcastFragment
      ...usePlayWithRestrictions_cloudcast
    }
    ... on Node {
      __isNode: __typename
      id
    }
  }
}

fragment CloudcastComments_cloudcast_4wMsyD on Cloudcast {
  id
  isExclusive
  restrictedReason
  audioType
  owner {
    id
    isSubscribedTo
    isViewer
  }
  comments(first: 10, promotedCommentId: $commentId) {
    commentsDisabled
    edges {
      ...CommentList_commentEdges
      cursor
      node {
        __typename
        id
      }
    }
    pageInfo {
      endCursor
      hasNextPage
    }
  }
  creatorAttributions(first: 100) {
    edges {
      node {
        id
      }
    }
  }
  ...CloudcastCommentForm_cloudcast
}

fragment CloudcastComments_viewer on Viewer {
  ...CloudcastCommentForm_viewer
}

fragment CommentActions_comment on Comment {
  id
  canDelete
  canBlock
  user {
    id
    isViewer
    isBlocked
  }
  commentObject {
    __typename
    ... on Node {
      __isNode: __typename
      id
    }
  }
  ...CommentReplyButton_comment
  ...CommentLikeButton_comment
}

fragment CommentForm_viewer on Viewer {
  me {
    displayName
    ...ImageUser_user
    id
  }
}

fragment CommentLikeButton_comment on Comment {
  id
  isLiked
  likeCount
}

fragment CommentList_commentEdges on CommentEdge {
  cursor
  node {
    ...ItemCommentList_comment
    id
  }
}

fragment CommentReplyButton_comment on Comment {
  id
}

fragment CommentRow_comment on Comment {
  id
  comment
  created
  isDeleted
  isSpam
  user {
    id
    username
    displayName
    ...ImageUser_user
    ...Hovercard_user
    ...Username_user
  }
  ...CommentTime_comment
  ...CommentActions_comment
  ...SelectCommentBadge_comment
  ...useGetCommentUrl_comment
}

fragment CommentTime_comment on Comment {
  commentObject {
    __typename
    ... on Node {
      __isNode: __typename
      id
    }
  }
  ...CloudcastCommentTime_comment
}

fragment Hovercard_user on User {
  id
}

fragment ImageUser_user on User {
  picture {
    urlRoot
    primaryColor
  }
  displayName
}

fragment ItemCommentList_comment on Comment {
  ...TopLevelComment_comment
}

fragment SelectCommentBadge_comment on Comment {
  isFromSelectSubscriber
}

fragment TopLevelComment_comment on Comment {
  ...CommentRow_comment
  isDeleted
  children(first: 100) {
    edges {
      node {
        ...CommentRow_comment
        id
        __typename
      }
      cursor
    }
    pageInfo {
      endCursor
      hasNextPage
    }
  }
}

fragment UserBadge_user on User {
  hasProFeatures
  isStaff
  hasPremiumFeatures
}

fragment Username_user on User {
  username
  displayName
  ...UserBadge_user
  ...Hovercard_user
}

fragment hasAudioCloudcastFragment_3lzM42 on Cloudcast {
  streamInfo(timestamper: false) {
    __typename
  }
}

fragment isNowPlayingCloudcastFragment on Cloudcast {
  id
}

fragment playbackPositionCloudcastFragment on Cloudcast {
  id
  currentPosition
}

fragment useCreateComment_commentObject on Node {
  __isNode: __typename
  __typename
  ... on Cloudcast {
    audioLength
  }
}

fragment useExclusiveCloudcastModal_cloudcast on Cloudcast {
  id
  isExclusive
  owner {
    username
    id
  }
}

fragment useExclusivePreviewModal_cloudcast on Cloudcast {
  id
  isExclusivePreviewOnly
  owner {
    username
    id
  }
}

fragment useGetCommentUrl_comment on Comment {
  id
  commentObject {
    __typename
    ... on Cloudcast {
      owner {
        username
        id
      }
      slug
    }
    ... on Post {
      owner {
        username
        id
      }
      slug
    }
    ... on Node {
      __isNode: __typename
      id
    }
  }
}

fragment usePlayWithRestrictions_cloudcast on Cloudcast {
  id
  owner {
    isSubscribedTo
    isViewer
    id
  }
  isPlayable
  ...hasAudioCloudcastFragment_3lzM42
  currentPosition
  repeatPlayAmount
  hasPlayCompleted
  seekRestriction
  isExclusive
  ...useExclusivePreviewModal_cloudcast
  ...useExclusiveCloudcastModal_cloudcast
}`,
  MoreFromOwnerQuery: `
query MoreFromOwnerQuery(
  $lookup: CloudcastLookup!
) {
  cloudcast: cloudcastLookup(lookup: $lookup) {
    owner {
      displayName
      id
			
    }
    moreFromOwner(first: 10) {
      edges {
        node {
          ...MoreFromUserCard_cloudcast
          id
          audioLength
          url
          plays
        }
      }
    }
    id
  }
  viewer {
    id
  }
}

fragment CardPlayButton_cloudcast on Cloudcast {
  id
  restrictedReason
  proportionListened
  owner {
    isSubscribedTo
    isViewer
    id
  }
  isAwaitingAudio
  isDraft
  isPlayable
  currentPosition
  ...playbackPositionCloudcastFragment
  previewUrl
  isExclusive
  isDisabledCopyright
  ...CardStaticPlayButton_cloudcast
  ...useAudioPreview_cloudcast
  ...usePlayWithRestrictions_cloudcast
}

fragment CardStaticPlayButton_cloudcast on Cloudcast {
  owner {
    username
    id
		picture {
				urlRoot
			}
  }
  slug
  id
  restrictedReason
}

fragment ImageCloudcast_cloudcast on Cloudcast {
  name
  picture {
    urlRoot
    primaryColor
  }
}

fragment MoreFromUserCard_cloudcast on Cloudcast {
  name
  publishDate
  slug
  owner {
    username
    id
  }
  ...ImageCloudcast_cloudcast
  ...CardPlayButton_cloudcast
}

fragment hasAudioCloudcastFragment_3lzM42 on Cloudcast {
  streamInfo(timestamper: false) {
    __typename
  }
}

fragment playbackPositionCloudcastFragment on Cloudcast {
  id
  currentPosition
}

fragment useAudioPreview_cloudcast on Cloudcast {
  id
  previewUrl
}

fragment useExclusiveCloudcastModal_cloudcast on Cloudcast {
  id
  isExclusive
  owner {
    username
    id
  }
}

fragment useExclusivePreviewModal_cloudcast on Cloudcast {
  id
  isExclusivePreviewOnly
  owner {
		displayName
    username
    id
  }
}

fragment usePlayWithRestrictions_cloudcast on Cloudcast {
  id
  owner {
    isSubscribedTo
    isViewer
    id
  }
  isPlayable
  ...hasAudioCloudcastFragment_3lzM42
  currentPosition
  repeatPlayAmount
  hasPlayCompleted
  seekRestriction
  isExclusive
  ...useExclusivePreviewModal_cloudcast
  ...useExclusiveCloudcastModal_cloudcast
}

`
};