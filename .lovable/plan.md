
# Security Remediation Plan

## Overview
This plan addresses the security vulnerabilities discovered during the comprehensive security review, with a focus on the critical privilege escalation vulnerability in the `user_roles` table.

---

## Phase 1: Critical Fix - User Roles RLS Policies

### Problem
The `user_roles` table lacks INSERT, UPDATE, and DELETE policies, allowing any authenticated user to potentially grant themselves admin privileges.

### Solution
Create three new RLS policies that restrict role management to existing administrators only.

### Database Migration

```sql
-- Policy 1: Only admins can insert new role assignments
CREATE POLICY "Admins can insert user_roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Policy 2: Only admins can update role assignments  
CREATE POLICY "Admins can update user_roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Policy 3: Only admins can delete role assignments
CREATE POLICY "Admins can delete user_roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
```

### Verification
After applying the migration, the security scan should show no critical findings for the `user_roles` table.

---

## Phase 2: Enable Leaked Password Protection

### Action Required
Enable leaked password protection in the Lovable Cloud authentication settings. This is a configuration change, not a code change.

### Steps
1. Open the Lovable Cloud dashboard
2. Navigate to Auth Settings
3. Enable "Leaked Password Protection"

---

## Phase 3: (Optional) Edge Function Rate Limiting

### Recommendation
Consider adding rate limiting to edge functions that make external AI API calls to prevent abuse and cost overruns.

### Affected Functions
- `extract-pdf-text`
- `extract-references`
- `find-applicable`

### Implementation Approach
Add a simple token-bucket or fixed-window rate limiter using a database table or in-memory counter.

---

## Technical Details

### Files to Modify
No frontend code changes are required. All fixes are database-level migrations.

### Migration File
A single SQL migration will be created to add the three missing RLS policies.

### Security Check Order
1. Apply database migration
2. Re-run security scan
3. Verify all critical issues are resolved
4. Enable leaked password protection in dashboard

---

## Post-Implementation Verification

After implementing the fixes:
1. Run the security scan again to confirm no critical issues remain
2. Test that admins can still manage user roles
3. Test that non-admin users cannot insert/update/delete roles
4. Verify the backoffice functionality remains intact
