"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Building2, Users, ArrowLeft, ArrowRight, Check } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { SwyftLogo } from "@/components/swyft-logo"

type UserType = "landlord" | "company"
type CompanySize = "1-10" | "11-50" | "51-200" | "200+"

interface FormData {
  userType: UserType
  email: string
  password: string
  confirmPassword: string
  name: string
  phone: string
  address: string
  description: string
  companyName: string
  contactName: string
  companySize: CompanySize
  companyEmail: string
  companyPhone: string
  companyAddress: string
  companyDescription: string
  agreeToTerms: boolean
}

const initialFormData: FormData = {
  userType: "landlord",
  email: "",
  password: "",
  confirmPassword: "",
  name: "",
  phone: "",
  address: "",
  description: "",
  companyName: "",
  contactName: "",
  companySize: "1-10",
  companyEmail: "",
  companyPhone: "",
  companyAddress: "",
  companyDescription: "",
  agreeToTerms: false,
}

export default function SignUpPage() {
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { signUp } = useAuth()
  const updateCompany = useMutation(api.companies.updateCompany)
  const setCompanyKind = useMutation(api.companies.setCompanyKind)

  const updateFormData = (field: keyof FormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!formData.userType
      case 2:
        return !!(
          formData.email &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email) &&
          formData.password &&
          formData.confirmPassword &&
          formData.password === formData.confirmPassword &&
          formData.password.length >= 6
        )
      case 3:
        if (formData.userType === "company") {
          return !!(
            formData.companyName &&
            formData.contactName &&
            formData.companyEmail &&
            formData.companyPhone &&
            formData.companySize
          )
        } else {
          return !!(formData.name && formData.phone)
        }
      case 4:
        return formData.agreeToTerms
      default:
        return false
    }
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 4))
    } else {
      toast.error("Please fill in all required fields")
    }
  }

  const handlePrevious = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1))
  }

  const handleSubmit = async () => {
    if (!validateStep(4)) {
      toast.error("Please agree to the terms and conditions");
      return;
    }

    setLoading(true);
    try {
      // Convex Auth creates the user and seeds an owner profile + company.
      // Pass the contact name + phone so they're written server-side at
      // creation (no auth race), unlike the company fields below.
      const { error: signUpError } = await signUp(formData.email, formData.password, {
        name: formData.userType === "company" ? formData.contactName : formData.name,
        phone: formData.userType === "company" ? formData.companyPhone : formData.phone,
      });
      if (signUpError) throw signUpError;

      // Fill in the company details the multi-step form collected.
      const companyName =
        formData.userType === "company"
          ? formData.companyName
          : formData.name
            ? `${formData.name}'s Properties`
            : undefined;
      const companyArgs = {
        name: companyName,
        email: formData.userType === "company" ? formData.companyEmail : formData.email,
        phone: formData.userType === "company" ? formData.companyPhone : formData.phone,
        address: formData.userType === "company" ? formData.companyAddress : formData.address,
        size: formData.userType === "company" ? formData.companySize : undefined,
        description:
          formData.userType === "company" ? formData.companyDescription : formData.description,
      };
      // signUp() resolves before the new session token reaches the Convex
      // client, so these mutations can briefly run unauthenticated. Retry until
      // the token propagates. seedForNewUser already created the company (as a
      // landlord), so failing here is non-fatal — it just leaves the details
      // unset / the company type as landlord.
      const isPropertyManager = formData.userType === "company";
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          await updateCompany(companyArgs);
          // A "company" sign-up is a property manager; flip the company kind
          // (which also sets the owner's role to manager).
          if (isPropertyManager) {
            await setCompanyKind({ kind: "property_manager" });
          }
          break;
        } catch (err: any) {
          if (attempt < 9 && /not authenticated/i.test(err?.message ?? "")) {
            await new Promise((resolve) => setTimeout(resolve, 300));
            continue;
          }
          break;
        }
      }

      toast.success("Account created successfully!");
      router.push("/dashboard");
    } catch (error: any) {
      console.error("Signup error:", error);
      toast.error(error?.message || "Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  const getUserTypeIcon = (type: UserType) => {
    switch (type) {
      case "landlord":
        return <Building2 className="h-8 w-8" />
      case "company":
        return <Users className="h-8 w-8" />
    }
  }

  const getUserTypeDescription = (type: UserType) => {
    switch (type) {
      case "landlord":
        return "Property owner managing rental properties and tenants"
      case "company":
        return "Property management company or firm managing units on behalf of owners"
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            <SwyftLogo className="h-11 w-auto" priority />
          </div>
          <CardTitle className="text-2xl">Create Your Account</CardTitle>
          <CardDescription>
            Step {currentStep} of 4 -{" "}
            {currentStep === 1
              ? "Choose Account Type"
              : currentStep === 2
                ? "Account Credentials"
                : currentStep === 3
                  ? "Profile Information"
                  : "Terms & Conditions"}
          </CardDescription>

          {/* Progress bar */}
          <div className="flex justify-center mt-4">
            <div className="flex space-x-2">
              {[1, 2, 3, 4].map((step) => (
                <div
                  key={step}
                  className={`w-3 h-3 rounded-full ${step <= currentStep ? "bg-green-600" : "bg-gray-300"}`}
                />
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Step 1: User Type Selection */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <Label className="text-base font-medium">What best describes you?</Label>
              <div className="grid gap-4">
                {(["landlord", "company"] as UserType[]).map((type) => (
                  <div
                    key={type}
                    className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      formData.userType === type
                        ? "border-green-600 bg-green-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => updateFormData("userType", type)}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`p-2 rounded-lg ${
                          formData.userType === type ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {getUserTypeIcon(type)}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium capitalize mb-1">
                          {type === "company" ? "Property Manager" : type}
                        </h3>
                        <p className="text-sm text-gray-600">{getUserTypeDescription(type)}</p>
                      </div>
                      {formData.userType === type && <Check className="h-5 w-5 text-green-600" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Account Credentials */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateFormData("email", e.target.value)}
                  placeholder="your@email.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => updateFormData("password", e.target.value)}
                  placeholder="Minimum 6 characters"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password *</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => updateFormData("confirmPassword", e.target.value)}
                  placeholder="Confirm your password"
                  required
                />
                {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                  <p className="text-sm text-red-600">Passwords do not match</p>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Profile Information */}
          {currentStep === 3 && (
            <div className="space-y-4">
              {formData.userType === "company" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name *</Label>
                    <Input
                      id="companyName"
                      value={formData.companyName}
                      onChange={(e) => updateFormData("companyName", e.target.value)}
                      placeholder="Your Company Name"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contactName">Contact Person Name *</Label>
                    <Input
                      id="contactName"
                      value={formData.contactName}
                      onChange={(e) => updateFormData("contactName", e.target.value)}
                      placeholder="Primary contact person"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="companyEmail">Company Email *</Label>
                    <Input
                      id="companyEmail"
                      type="email"
                      value={formData.companyEmail}
                      onChange={(e) => updateFormData("companyEmail", e.target.value)}
                      placeholder="company@email.com"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="companyPhone">Company Phone *</Label>
                    <Input
                      id="companyPhone"
                      value={formData.companyPhone}
                      onChange={(e) => updateFormData("companyPhone", e.target.value)}
                      placeholder="+254 700 000 000"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="companySize">Company Size *</Label>
                    <Select
                      value={formData.companySize}
                      onValueChange={(value: CompanySize) => updateFormData("companySize", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select company size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1-10">1-10 employees</SelectItem>
                        <SelectItem value="11-50">11-50 employees</SelectItem>
                        <SelectItem value="51-200">51-200 employees</SelectItem>
                        <SelectItem value="200+">200+ employees</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="companyAddress">Company Address</Label>
                    <Textarea
                      id="companyAddress"
                      value={formData.companyAddress}
                      onChange={(e) => updateFormData("companyAddress", e.target.value)}
                      placeholder="Company physical address"
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="companyDescription">Company Description</Label>
                    <Textarea
                      id="companyDescription"
                      value={formData.companyDescription}
                      onChange={(e) => updateFormData("companyDescription", e.target.value)}
                      placeholder="Brief description of your company"
                      rows={3}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => updateFormData("name", e.target.value)}
                      placeholder="Your full name"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number *</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => updateFormData("phone", e.target.value)}
                      placeholder="+254 700 000 000"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">Address</Label>
                    <Textarea
                      id="address"
                      value={formData.address}
                      onChange={(e) => updateFormData("address", e.target.value)}
                      placeholder="Your address"
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">About You</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => updateFormData("description", e.target.value)}
                      placeholder="Brief description about yourself and your experience"
                      rows={3}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 4: Terms & Conditions */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg max-h-60 overflow-y-auto">
                <h3 className="font-medium mb-2">Terms and Conditions</h3>
                <div className="text-sm text-gray-600 space-y-2">
                  <p>By creating an account with Swyft Agent, you agree to:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Provide accurate and truthful information</li>
                    <li>Use the platform responsibly and legally</li>
                    <li>Respect other users and their property listings</li>
                    <li>Comply with local real estate laws and regulations</li>
                    <li>Pay applicable fees for premium services</li>
                    <li>Allow us to send you important account notifications</li>
                  </ul>
                  <p className="mt-4">
                    We are committed to protecting your privacy and will handle your data in accordance with our{" "}
                    <Link href="/privacy" target="_blank" className="font-medium text-emerald-700 hover:underline">
                      Privacy Policy
                    </Link>
                    . You can also review our full{" "}
                    <Link href="/terms" target="_blank" className="font-medium text-emerald-700 hover:underline">
                      Terms and Conditions
                    </Link>
                    .
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="agreeToTerms"
                  checked={formData.agreeToTerms}
                  onCheckedChange={(checked) => updateFormData("agreeToTerms", checked)}
                />
                <Label htmlFor="agreeToTerms" className="text-sm">
                  I agree to the{" "}
                  <Link href="/terms" target="_blank" className="font-medium text-emerald-700 hover:underline">
                    Terms and Conditions
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" target="_blank" className="font-medium text-emerald-700 hover:underline">
                    Privacy Policy
                  </Link>{" "}
                  *
                </Label>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-6">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentStep === 1}
              className="flex items-center gap-2 bg-transparent"
            >
              <ArrowLeft className="h-4 w-4" />
              Previous
            </Button>

            {currentStep < 4 ? (
              <Button onClick={handleNext} disabled={!validateStep(currentStep)} className="flex items-center gap-2">
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={!validateStep(4) || loading} className="flex items-center gap-2">
                {loading ? "Creating Account..." : "Create Account"}
                <Check className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="text-center pt-4 border-t">
            <p className="text-sm text-gray-600">
              Already have an account?{" "}
              <Link href="/login" className="text-green-600 hover:underline">
                Sign in here
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
