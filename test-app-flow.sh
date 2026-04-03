#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3000"
TEST_EMAIL="testuser_$(date +%s)@example.com"
TEST_PASSWORD="Test123456"

echo -e "${YELLOW}=== QUOTE APP FLOW TEST ===${NC}\n"

# Test 1: Register
echo -e "${YELLOW}1. Testing Registration...${NC}"
REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"country_code\":\"IT\",\"language\":\"it\",\"legalAccepted\":[]}")

echo "Response: $REGISTER_RESPONSE"

USER_ID=$(echo "$REGISTER_RESPONSE" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
if [ -z "$USER_ID" ]; then
  echo -e "${RED}✗ Registration failed${NC}\n"
  exit 1
else
  echo -e "${GREEN}✓ Registration success - User ID: $USER_ID${NC}\n"
fi

# Test 2: Login with Supabase
echo -e "${YELLOW}2. Testing Login (Supabase Auth)...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "https://coqfepebhigdeevppdbr.supabase.co/auth/v1/token?grant_type=password" \
  -H 'Content-Type: application/json' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvcWZlcGViaGlnZGVldnBwZGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MDY2MjIsImV4cCI6MjA4NjQ4MjYyMn0.ErWbME_LN6aSYMryJdNMlgAVL-WcmM2hfGLy5hpmZSY' \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" 2>/dev/null)

echo "Response: $LOGIN_RESPONSE"

ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
if [ -z "$ACCESS_TOKEN" ]; then
  echo -e "${RED}✗ Login failed${NC}\n"
  exit 1
else
  echo -e "${GREEN}✓ Login success - Token obtained${NC}\n"
fi

# Test 3: Get user profile
echo -e "${YELLOW}3. Testing Get User Profile...${NC}"
PROFILE_RESPONSE=$(curl -s -X GET "$BASE_URL/api/user/profile" \
  -H "Authorization: Bearer $ACCESS_TOKEN" 2>/dev/null)

echo "Response: $PROFILE_RESPONSE"

if echo "$PROFILE_RESPONSE" | grep -q "error"; then
  echo -e "${RED}✗ Get profile failed${NC}\n"
else
  echo -e "${GREEN}✓ Get profile successful${NC}\n"
fi

# Test 4: Test voice process endpoint
echo -e "${YELLOW}4. Testing Voice API Endpoint...${NC}"
VOICE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/voice/process" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"text":"test quote"}' 2>/dev/null)

echo "Response: $VOICE_RESPONSE"

if echo "$VOICE_RESPONSE" | grep -q '"error"'; then
  echo -e "${YELLOW}⚠ Voice endpoint returned error (expected if no implementation)${NC}\n"
else
  echo -e "${GREEN}✓ Voice endpoint responded${NC}\n"
fi

# Test 5: Check health of all major endpoints
echo -e "${YELLOW}5. Testing Endpoint Health...${NC}"

ENDPOINTS=(
  "/api/auth/register"
  "/api/stripe/create-checkout-session"
  "/api/quote/send-email"
  "/api/voice/semantic-match"
  "/api/listini/embed"
)

for endpoint in "${ENDPOINTS[@]}"; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL$endpoint" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -d '{}' 2>/dev/null)
  
  if [ "$HTTP_CODE" -eq "405" ] || [ "$HTTP_CODE" -eq "400" ] || [ "$HTTP_CODE" -eq "200" ]; then
    echo -e "${GREEN}✓ $endpoint (HTTP $HTTP_CODE)${NC}"
  elif [ "$HTTP_CODE" -eq "401" ] || [ "$HTTP_CODE" -eq "403" ]; then
    echo -e "${YELLOW}⚠ $endpoint (HTTP $HTTP_CODE - Auth issue)${NC}"
  else
    echo -e "${RED}✗ $endpoint (HTTP $HTTP_CODE)${NC}"
  fi
done

echo -e "\n${GREEN}=== Test Complete ===${NC}"
