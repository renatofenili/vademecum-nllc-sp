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