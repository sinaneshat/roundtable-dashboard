'use client';

import { AlertCircle, CheckCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/ui/cn';

// Enhanced form context with validation state
interface FormContextValue {
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  isSubmitting: boolean;
  isValidating: boolean;
  setFieldError: (field: string, error?: string) => void;
  setFieldTouched: (field: string, touched?: boolean) => void;
  validateField: (field: string, value: any) => Promise<string | undefined>;
  clearErrors: () => void;
}

const FormContext = createContext<FormContextValue | null>(null);

export function useFormContext() {
  const context = useContext(FormContext);
  if (!context) {
    throw new Error('useFormContext must be used within a FormProvider');
  }
  return context;
}

// Enhanced form provider with advanced validation
interface FormProviderProps {
  children: React.ReactNode;
  schema?: z.ZodObject<any>;
  onSubmit?: (data: Record<string, any>) => Promise<void> | void;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  debounceValidation?: number;
}

export function FormProvider({
  children,
  schema,
  onSubmit,
  validateOnChange = true,
  validateOnBlur = true,
  debounceValidation = 300,
}: FormProviderProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isSubmitting, _setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationTimeouts, setValidationTimeouts] = useState<Record<string, NodeJS.Timeout>>({});

  const setFieldError = (field: string, error?: string) => {
    setErrors(prev => ({
      ...prev,
      [field]: error || '',
    }));
  };

  const setFieldTouched = (field: string, touched = true) => {
    setTouched(prev => ({
      ...prev,
      [field]: touched,
    }));
  };

  const validateField = async (field: string, value: any): Promise<string | undefined> => {
    if (!schema) return undefined;

    try {
      setIsValidating(true);
      
      // Clear existing timeout for this field
      if (validationTimeouts[field]) {
        clearTimeout(validationTimeouts[field]);
      }

      return new Promise((resolve) => {
        const timeout = setTimeout(async () => {
          try {
            // Validate single field using schema.pick
            const fieldSchema = schema.pick({ [field]: true } as any);
            fieldSchema.parse({ [field]: value });
            setFieldError(field, undefined);
            resolve(undefined);
          } catch (error) {
            if (error instanceof z.ZodError) {
              const fieldError = error.issues.find((e: z.ZodIssue) => e.path.includes(field));
              const errorMessage = fieldError?.message || 'Invalid value';
              setFieldError(field, errorMessage);
              resolve(errorMessage);
            } else {
              resolve('Validation error');
            }
          } finally {
            setIsValidating(false);
          }
        }, debounceValidation);

        setValidationTimeouts(prev => ({
          ...prev,
          [field]: timeout,
        }));
      });
    } catch (error) {
      setIsValidating(false);
      return 'Validation error';
    }
  };

  const clearErrors = () => {
    setErrors({});
    setTouched({});
  };

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(validationTimeouts).forEach(timeout => clearTimeout(timeout));
    };
  }, [validationTimeouts]);

  const contextValue: FormContextValue = {
    errors,
    touched,
    isSubmitting,
    isValidating,
    setFieldError,
    setFieldTouched,
    validateField,
    clearErrors,
  };

  return (
    <FormContext.Provider value={contextValue}>
      {children}
    </FormContext.Provider>
  );
}

// Enhanced form field with validation
interface FormFieldProps {
  name: string;
  label?: string;
  description?: string;
  required?: boolean;
  children: React.ReactElement;
  showValidationState?: boolean;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  className?: string;
}

export function FormField({
  name,
  label,
  description,
  required = false,
  children,
  showValidationState = true,
  validateOnChange = true,
  validateOnBlur = true,
  className,
}: FormFieldProps) {
  const { errors, touched, isValidating, setFieldTouched, validateField } = useFormContext();
  const error = errors[name];
  const isTouched = touched[name];
  const hasError = error && isTouched;

  const handleChange = async (value: any) => {
    if (validateOnChange) {
      await validateField(name, value);
    }
  };

  const handleBlur = async (value: any) => {
    setFieldTouched(name, true);
    if (validateOnBlur) {
      await validateField(name, value);
    }
  };

  // Clone child element with enhanced props
  const enhancedChild = React.cloneElement(children as React.ReactElement<any>, {
    name,
    id: name,
    'aria-invalid': hasError,
    'aria-describedby': error ? `${name}-error` : description ? `${name}-description` : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const originalOnChange = (children as React.ReactElement<any>).props.onChange;
      originalOnChange?.(e);
      handleChange(e.target.value);
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const originalOnBlur = (children as React.ReactElement<any>).props.onBlur;
      originalOnBlur?.(e);
      handleBlur(e.target.value);
    },
    className: cn(
      (children as React.ReactElement<any>).props.className,
      hasError && 'border-destructive focus:ring-destructive',
      isTouched && !hasError && showValidationState && 'border-chart-3 focus:ring-chart-3'
    ),
  });

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <Label htmlFor={name} className="flex items-center gap-1">
          {label}
          {required && <span className="text-destructive">*</span>}
          {showValidationState && isTouched && (
            <>
              {isValidating && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              {!isValidating && !hasError && <CheckCircle className="h-3 w-3 text-chart-3" />}
              {!isValidating && hasError && <AlertCircle className="h-3 w-3 text-destructive" />}
            </>
          )}
        </Label>
      )}
      
      {enhancedChild}
      
      {description && !hasError && (
        <p id={`${name}-description`} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
      
      {hasError && (
        <p id={`${name}-error`} className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );
}

// Enhanced password input with strength indicator
interface PasswordFieldProps {
  name: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  showStrength?: boolean;
  className?: string;
}

export function PasswordField({
  name,
  label = 'Password',
  placeholder = 'Enter password',
  required = false,
  showStrength = true,
  className,
}: PasswordFieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [strength, setStrength] = useState(0);
  const t = useTranslations();
  const tForms = useTranslations('forms');

  const calculateStrength = (pwd: string): number => {
    let score = 0;
    if (pwd.length >= 8) score += 20;
    if (pwd.length >= 12) score += 10;
    if (/[a-z]/.test(pwd)) score += 20;
    if (/[A-Z]/.test(pwd)) score += 20;
    if (/[0-9]/.test(pwd)) score += 20;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 10;
    return Math.min(score, 100);
  };

  const getStrengthLabel = (strength: number): string => {
    if (strength < 30) return t('password.weak');
    if (strength < 60) return t('password.fair');
    if (strength < 80) return t('password.good');
    return t('password.strong');
  };

  const getStrengthColor = (strength: number): string => {
    if (strength < 30) return 'bg-destructive';
    if (strength < 60) return 'bg-chart-2';
    if (strength < 80) return 'bg-primary';
    return 'bg-chart-3';
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    setStrength(calculateStrength(value));
  };

  return (
    <FormField
      name={name}
      label={label}
      required={required}
      className={className}
    >
      <div className="relative">
        <Input
          type={showPassword ? 'text' : 'password'}
          placeholder={placeholder}
          value={password}
          onChange={handlePasswordChange}
          className="pr-10"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? tForms('hidePassword') : tForms('showPassword')}
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Eye className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
        
        {showStrength && password && (
          <div className="mt-2 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Password strength</span>
              <span className={cn(
                "font-medium",
                strength < 30 ? 'text-destructive' :
                strength < 60 ? 'text-chart-2' :
                strength < 80 ? 'text-primary' :
                'text-chart-3'
              )}>
                {getStrengthLabel(strength)}
              </span>
            </div>
            <Progress 
              value={strength} 
              className={cn("h-2", `[&>div]:${getStrengthColor(strength)}`)}
            />
          </div>
        )}
      </div>
    </FormField>
  );
}

// Enhanced textarea with character count
interface TextareaFieldProps {
  name: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  minLength?: number;
  showCount?: boolean;
  rows?: number;
  className?: string;
}

export function TextareaField({
  name,
  label,
  placeholder,
  required = false,
  maxLength,
  minLength,
  showCount = true,
  rows = 4,
  className,
}: TextareaFieldProps) {
  const [value, setValue] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
  };

  return (
    <FormField
      name={name}
      label={label}
      required={required}
      className={className}
    >
      <div className="space-y-2">
        <Textarea
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          maxLength={maxLength}
          rows={rows}
          className={cn(
            'resize-none',
            maxLength && value.length > maxLength * 0.9 && 'border-chart-2 focus:ring-chart-2'
          )}
        />
        
        {showCount && (maxLength || minLength) && (
          <div className="flex justify-between text-xs text-muted-foreground">
            {minLength && (
              <span className={cn(
                value.length < minLength && 'text-chart-2'
              )}>
                Minimum {minLength} characters
              </span>
            )}
            {maxLength && (
              <span className={cn(
                value.length > maxLength * 0.9 && 'text-chart-2',
                value.length === maxLength && 'text-destructive'
              )}>
                {value.length}/{maxLength}
              </span>
            )}
          </div>
        )}
      </div>
    </FormField>
  );
}

// Form submit button with loading state
interface FormSubmitProps {
  children: React.ReactNode;
  isLoading?: boolean;
  disabled?: boolean;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export function FormSubmit({
  children,
  isLoading,
  disabled,
  variant = 'default',
  size = 'default',
  className,
}: FormSubmitProps) {
  const { isSubmitting } = useFormContext();
  const loading = isLoading || isSubmitting;

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={disabled || loading}
      className={className}
    >
      {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
      {children}
    </Button>
  );
}

// Form wrapper with automatic submission handling
interface EnhancedFormProps {
  children: React.ReactNode;
  onSubmit: (data: Record<string, any>) => Promise<void> | void;
  schema?: z.ZodObject<any>;
  className?: string;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  debounceValidation?: number;
}

export function EnhancedForm({
  children,
  onSubmit,
  schema,
  className,
  validateOnChange = true,
  validateOnBlur = true,
  debounceValidation = 300,
}: EnhancedFormProps) {
  const [_isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      const data = Object.fromEntries(formData.entries());
      
      // Validate with schema if provided
      if (schema) {
        schema.parse(data);
      }

      await onSubmit(data);
    } catch (error) {
      console.error('Form submission error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormProvider
      schema={schema}
      validateOnChange={validateOnChange}
      validateOnBlur={validateOnBlur}
      debounceValidation={debounceValidation}
    >
      <form onSubmit={handleSubmit} className={className} noValidate>
        {children}
      </form>
    </FormProvider>
  );
}

