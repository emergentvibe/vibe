# Phase 9: Usage Tracking & Token System Implementation Plan

## Overview
This document outlines the implementation strategy for adding usage tracking, a paywall system, and token validation to the Vibe extension. These features will allow for monetization while providing users with a free tier of functionality.

## Core Components

### 1. Usage Tracking System
- Track semantic searches performed by users
- Store usage data locally with sync to cloud when possible
- Reset counters on appropriate intervals (daily, monthly)
- Handle offline usage tracking with sync on reconnection

### 2. Paywall Implementation
- Implement free tier limits (e.g., 25 semantic searches per day)
- Design unobtrusive paywall UI that appears when limits are reached
- Create upgrade flow with token redemption interface
- Ensure graceful degradation when limits are hit

### 3. Token System
- Generate and validate unique redemption tokens
- Create secure token verification mechanism
- Implement token storage and association with user accounts
- Handle token expiration and renewal

## Implementation Strategy

### Local Storage Architecture
```typescript
// Types
interface UsageData {
  semanticSearches: {
    count: number;
    lastReset: string; // ISO date string
    dailyLimit: number;
  };
  tokens: {
    active: string | null;
    history: Array<{
      token: string;
      activatedAt: string;
      expiresAt: string;
      plan: 'monthly' | 'yearly' | 'lifetime';
    }>;
  };
}

// Storage keys
const STORAGE_KEYS = {
  USAGE_DATA: 'vibe_usage_data',
  USER_INFO: 'vibe_user_info',
  TOKEN_INFO: 'vibe_token_info'
};
```

### Usage Tracking Implementation
```typescript
// Track a semantic search
async function trackSemanticSearch(): Promise<boolean> {
  const usageData = await getUsageData();
  
  // Check if we need to reset daily counter
  const today = new Date().toISOString().split('T')[0];
  if (usageData.semanticSearches.lastReset !== today) {
    usageData.semanticSearches.count = 0;
    usageData.semanticSearches.lastReset = today;
  }
  
  // Increment counter
  usageData.semanticSearches.count++;
  
  // Save updated usage data
  await saveUsageData(usageData);
  
  // Return whether the user is within limits
  return usageData.semanticSearches.count <= usageData.semanticSearches.dailyLimit;
}

// Check if user can perform a semantic search
async function canPerformSemanticSearch(): Promise<boolean> {
  const usageData = await getUsageData();
  
  // Check if user has an active paid plan
  if (await hasActivePaidPlan()) {
    return true;
  }
  
  // Reset counter if needed (new day)
  const today = new Date().toISOString().split('T')[0];
  if (usageData.semanticSearches.lastReset !== today) {
    usageData.semanticSearches.count = 0;
    usageData.semanticSearches.lastReset = today;
    await saveUsageData(usageData);
    return true;
  }
  
  // Check if user is within free tier limits
  return usageData.semanticSearches.count < usageData.semanticSearches.dailyLimit;
}
```

### Token Generation & Validation (Backend Logic)
The token system will use a secure algorithm to generate and validate tokens. Here's the strategy:

```typescript
// Token generation (server-side)
function generateToken(
  plan: 'monthly' | 'yearly' | 'lifetime',
  email?: string // Optional: associate token with specific email
): string {
  // Components of the token
  const timestamp = Date.now();
  const randomPart = crypto.randomBytes(8).toString('hex');
  const planCode = plan === 'monthly' ? 'M' : plan === 'yearly' ? 'Y' : 'L';
  
  // Create payload
  const payload = {
    t: timestamp,
    p: planCode,
    e: email || null,
    r: randomPart
  };
  
  // Serialize and sign payload
  const serialized = JSON.stringify(payload);
  const signature = createHmac('sha256', SECRET_KEY)
    .update(serialized)
    .digest('hex')
    .substring(0, 8);
  
  // Combine parts into token
  const tokenParts = [
    planCode,
    randomPart,
    signature
  ];
  
  // Format as user-friendly token
  return tokenParts.join('-').toUpperCase();
}

// Token validation (client-side)
function validateToken(token: string): {
  valid: boolean;
  plan?: 'monthly' | 'yearly' | 'lifetime';
  error?: string;
} {
  // Parse token
  const parts = token.toUpperCase().split('-');
  if (parts.length !== 3) {
    return { valid: false, error: 'Invalid token format' };
  }
  
  const [planCode, randomPart, receivedSignature] = parts;
  
  // Check token format
  if (!/^[MYL]$/.test(planCode)) {
    return { valid: false, error: 'Invalid plan code' };
  }
  
  if (!/^[0-9A-F]{16}$/.test(randomPart)) {
    return { valid: false, error: 'Invalid token data' };
  }
  
  if (!/^[0-9A-F]{8}$/.test(receivedSignature)) {
    return { valid: false, error: 'Invalid signature' };
  }
  
  // Get plan type
  const plan = planCode === 'M' ? 'monthly' : planCode === 'Y' ? 'yearly' : 'lifetime';
  
  // Verify token with backend API
  // This is a placeholder for the actual API call
  return { valid: true, plan };
}
```

### Token Activation Flow
1. User purchases a plan on the payment website
2. System generates a unique token and delivers it to the user
3. User enters token in the Vibe extension
4. Extension validates token locally first (format check)
5. Extension sends token to validation API for secure verification
6. On successful validation, extension updates local storage with plan details
7. User's limits are updated based on the plan associated with the token

### Paywall UI Components
```typescript
// Paywall overlay
const paywallOverlay = document.createElement('div');
paywallOverlay.className = 'vibe-paywall-overlay';
paywallOverlay.innerHTML = `
  <div class="vibe-paywall-container">
    <h2>Search Limit Reached</h2>
    <p>You've used all 25 of your free daily semantic searches.</p>
    <p>Upgrade to Vibe Premium for unlimited searches.</p>
    
    <div class="vibe-paywall-options">
      <a href="https://vibehq.io/pricing" target="_blank" class="vibe-button primary">
        Upgrade Now
      </a>
      <button class="vibe-button secondary" id="vibe-redeem-token">
        Redeem Token
      </button>
    </div>
    
    <div class="vibe-paywall-footer">
      <p>Your limit will reset in <span id="vibe-reset-countdown">23:45:12</span></p>
    </div>
  </div>
`;

// Token redemption interface
const tokenRedemptionModal = document.createElement('div');
tokenRedemptionModal.className = 'vibe-token-modal';
tokenRedemptionModal.innerHTML = `
  <div class="vibe-token-container">
    <h2>Redeem Your Token</h2>
    <p>Enter your token code below to activate your premium features.</p>
    
    <form id="vibe-token-form">
      <input type="text" id="vibe-token-input" 
        placeholder="Enter token (format: X-XXXXXXXXXXXXXXXX-XXXXXXXX)" 
        maxlength="27"
      />
      <div id="vibe-token-error" class="vibe-token-error"></div>
      
      <div class="vibe-token-actions">
        <button type="button" class="vibe-button secondary" id="vibe-token-cancel">
          Cancel
        </button>
        <button type="submit" class="vibe-button primary" id="vibe-token-submit">
          Activate
        </button>
      </div>
    </form>
  </div>
`;
```

### Integration with Semantic Search Feature
The usage tracking will be integrated into the semantic search flow:

```typescript
// Modified semantic search flow
async function performSemanticSearch(query: string) {
  // Check if user can perform search
  const canSearch = await canPerformSemanticSearch();
  
  if (!canSearch) {
    // Show paywall
    showPaywall();
    return;
  }
  
  // Track this search
  await trackSemanticSearch();
  
  // Proceed with regular search logic
  // [...]
}
```

### Token Test Script
A Node.js script can be created to test token generation and validation:

```typescript
// test-token-system.js
const crypto = require('crypto');
const SECRET_KEY = 'test_secret_key'; // Would be environment variable in production

// Token generation function
function generateToken(plan, email) {
  // [Token generation logic from above]
}

// Token validation function
function validateToken(token) {
  // [Token validation logic from above]
}

// Test script
function runTests() {
  console.log('===== TOKEN SYSTEM TESTS =====');
  
  // Test token generation
  console.log('\n1. Generating tokens:');
  const monthlyToken = generateToken('monthly', 'test@example.com');
  console.log(`Monthly token: ${monthlyToken}`);
  
  const yearlyToken = generateToken('yearly');
  console.log(`Yearly token: ${yearlyToken}`);
  
  const lifetimeToken = generateToken('lifetime', 'premium@example.com');
  console.log(`Lifetime token: ${lifetimeToken}`);
  
  // Test token validation
  console.log('\n2. Validating tokens:');
  console.log(`Monthly token validation:`, validateToken(monthlyToken));
  console.log(`Yearly token validation:`, validateToken(yearlyToken));
  console.log(`Lifetime token validation:`, validateToken(lifetimeToken));
  
  // Test invalid tokens
  console.log('\n3. Testing invalid tokens:');
  console.log(`Invalid format:`, validateToken('NOT-A-VALID-TOKEN'));
  console.log(`Wrong signature:`, validateToken('M-1234567890ABCDEF-00000000'));
  
  // Test token tampering
  const tampered = monthlyToken.replace('M', 'L');
  console.log(`Tampered token:`, validateToken(tampered));
}

runTests();
```

## Next Steps

### Phase 9.1: Core Implementation
- Implement local storage system for usage tracking
- Create token validation utilities
- Design and implement paywall UI components
- Integrate with semantic search feature

### Phase 9.2: Backend Integration
- Set up token validation API endpoint
- Create token generation system for payment website
- Implement secure token exchange mechanism
- Add analytics for usage patterns

### Phase 9.3: User Experience Refinement
- Add usage statistics view for users
- Implement graceful countdown to limit reset
- Create onboarding flow for new premium users
- Design and implement referral system (optional)

## Technical Considerations

### Security
- Tokens must be securely generated with proper cryptographic methods
- Client-side validation should be supplemented with server validation
- Prevent token sharing by associating tokens with device/installation IDs
- Implement rate limiting for token validation attempts

### Performance
- Minimize API calls for token validation
- Cache validation results to reduce overhead
- Ensure paywall UI renders quickly when needed
- Background sync for usage data to avoid blocking UI

### Privacy
- Be transparent about what usage data is collected
- Minimize personal data stored with usage information
- Provide clear privacy policy regarding usage tracking
- Allow users to opt out of non-essential tracking

## Testing Strategy

### Unit Tests
- Token generation and validation functions
- Usage tracking and limit checking
- Storage operations and data format validation

### Integration Tests
- End-to-end token redemption flow
- Limit enforcement and paywall triggering
- Reset of daily/monthly counters

### User Acceptance Testing
- Test with various token types and plans
- Verify countdown accuracy for limit resets
- Test edge cases around limit boundaries
- Verify proper degradation when offline 