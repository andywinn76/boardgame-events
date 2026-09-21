"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function EventCreationForm({ action, initialError = "", children }) {
  const [state, formAction] = useActionState(action, {
    error: initialError,
    fields: [],
  });
  const formRef = useRef(null);

  function submitWithoutReset(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    form.querySelectorAll('[aria-invalid="true"]').forEach((field) => {
      field.removeAttribute("aria-invalid");
    });

    for (const fieldName of state.fields || []) {
      const field = form.elements.namedItem(fieldName);
      if (field instanceof HTMLElement) field.setAttribute("aria-invalid", "true");
    }

    form.querySelector('[aria-invalid="true"]')?.focus();
  }, [state]);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const venueSelect = form.elements.namedItem("venue_id");
    const newVenueName = form.elements.namedItem("new_venue_name");
    const locationLabel = form.elements.namedItem("location_label");
    if (!(locationLabel instanceof HTMLInputElement)) return;

    function updateLocationRequirement() {
      const hasVenue = Boolean(venueSelect?.value || newVenueName?.value.trim());
      locationLabel.required = !hasVenue;
    }

    updateLocationRequirement();
    const controls = [venueSelect, newVenueName].filter(Boolean);
    controls.forEach((control) => {
      control.addEventListener("change", updateLocationRequirement);
      control.addEventListener("input", updateLocationRequirement);
    });
    return () => controls.forEach((control) => {
      control.removeEventListener("change", updateLocationRequirement);
      control.removeEventListener("input", updateLocationRequirement);
    });
  }, []);

  return (
    <>
      {state.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <form
        ref={formRef}
        onSubmit={submitWithoutReset}
        className="space-y-4 [&_[data-slot=input]]:bg-card [&_[data-slot=textarea]]:bg-card [&_input:user-invalid]:border-destructive [&_input:user-invalid]:ring-3 [&_input:user-invalid]:ring-destructive/20 [&_select:user-invalid]:border-destructive [&_select:user-invalid]:ring-3 [&_select:user-invalid]:ring-destructive/20 [&_select[aria-invalid=true]]:border-destructive [&_select[aria-invalid=true]]:ring-3 [&_select[aria-invalid=true]]:ring-destructive/20"
      >
        {children}
      </form>
    </>
  );
}
