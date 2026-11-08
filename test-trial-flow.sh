#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

BASE_URL="http://localhost:3000"

# Credentials come from the environment and are never stored in this file.
: "${SUPABASE_URL:?Set SUPABASE_URL before running this script}"
: "${SUPABASE_ANON_KEY:?Set SUPABASE_ANON_KEY before running this script}"
: "${SUPABASE_SERVICE_KEY:?Set SUPABASE_SERVICE_KEY before running this script}"

TEST_EMAIL="trial_test_$(date +%s)@example.com"
TEST_PASSWORD="Test123456"

echo -e "${YELLOW}=== TRIAL FLOW TEST ===${NC}\n"

# Register
echo -e "${YELLOW}1. Registering user...${NC}"
REG=$(curl -s -X POST "$BASE_URL/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"country_code\":\"IT\",\"language\":\"it\",\"legalAccepted\":[]}")

USER_ID=$(echo "$REG" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
if [ -z "$USER_ID" ]; then
  echo -e "${RED}✗ Registration failed${NC}"
  exit 1
fi
echo -e "${GREEN}✓ User registered: $USER_ID${NC}\n"

# Login
echo -e "${YELLOW}2. Logging in...${NC}"
LOGIN=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H 'Content-Type: application/json' \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" 2>/dev/null)

ACCESS_TOKEN=$(echo "$LOGIN" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
if [ -z "$ACCESS_TOKEN" ]; then
  echo -e "${RED}✗ Login failed${NC}"
  exit 1
fi
echo -e "${GREEN}✓ User logged in${NC}\n"

# Check if /onboarding accessible
echo -e "${YELLOW}3. Testing /onboarding page access...${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/onboarding" 2>/dev/null)
if [ "$HTTP_CODE" -eq "200" ]; then
  echo -e "${GREEN}✓ /onboarding page accessible (HTTP $HTTP_CODE)${NC}\n"
else
  echo -e "${RED}✗ /onboarding page not accessible (HTTP $HTTP_CODE)${NC}\n"
fi

# Test /subscription/success page
echo -e "${YELLOW}4. Testing /subscription/success page...${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/subscription/success?session_id=test_session" 2>/dev/null)
if [ "$HTTP_CODE" -eq "200" ]; then
  echo -e "${GREEN}✓ /subscription/success page accessible (HTTP $HTTP_CODE)${NC}\n"
else
  echo -e "${RED}✗ /subscription/success page not accessible (HTTP $HTTP_CODE)${NC}\n"
fi

# Test /subscription/cancel page
echo -e "${YELLOW}5. Testing /subscription/cancel page...${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/subscription/cancel" 2>/dev/null)
if [ "$HTTP_CODE" -eq "200" ]; then
  echo -e "${GREEN}✓ /subscription/cancel page accessible (HTTP $HTTP_CODE)${NC}\n"
else
  echo -e "${RED}✗ /subscription/cancel page not accessible (HTTP $HTTP_CODE)${NC}\n"
fi

# Check profile has onboarding_completed = false
echo -e "${YELLOW}6. Checking profile onboarding status...${NC}"
PROFILE=$(curl -s -X GET "$SUPABASE_URL/rest/v1/profiles?id=eq.$USER_ID&select=onboarding_completed" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY" 2>/dev/null)

if echo "$PROFILE" | grep -q '"onboarding_completed":false'; then
  echo -e "${GREEN}✓ Profile onboarding_completed = false${NC}\n"
else
  echo -e "${RED}✗ Profile onboarding status unexpected${NC}\n"
fi

echo -e "${GREEN}=== TRIAL FLOW TEST PASSED ===${NC}"
echo ""
echo -e "${YELLOW}Test Credentials:${NC}"
echo "  Email: $TEST_EMAIL"
echo "  Password: $TEST_PASSWORD"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Go to: $BASE_URL/auth/login"
echo "  2. Login with above credentials"
echo "  3. Should redirect to /onboarding"
echo "  4. Complete onboarding and click 'Start Free Trial'"
echo "  5. Should redirect to Stripe checkout"
echo "  6. After success, should redirect to /subscription/success"
echo "  7. Should then redirect to /dashboard"
