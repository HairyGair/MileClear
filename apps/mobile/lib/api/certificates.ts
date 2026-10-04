import type {
  CertificatePurpose,
  MileageCertificatePreview,
  MileageCertificateSummary,
} from "@mileclear/shared";
import { apiRequest } from "./index";
import { downloadAndShareExport } from "./exports";

// Mileage record certificates (app/mileage-certificate.tsx). Preview is free;
// making, listing, withdrawing and the PDF are Pro.

export interface CertificateRequest {
  /** "YYYY-MM-DD", inclusive. */
  periodStart: string;
  periodEnd: string;
  vehicleId?: string | null;
  purpose?: CertificatePurpose | null;
}

export function previewCertificate(body: CertificateRequest) {
  return apiRequest<{ data: MileageCertificatePreview }>("/certificates/preview", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createCertificate(body: CertificateRequest) {
  return apiRequest<{ data: MileageCertificateSummary }>("/certificates", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchCertificates() {
  return apiRequest<{ data: MileageCertificateSummary[] }>("/certificates");
}

export function revokeCertificate(id: string) {
  return apiRequest<{ data: MileageCertificateSummary }>(`/certificates/${id}/revoke`, {
    method: "POST",
  });
}

/** Downloads the certificate PDF and opens the share sheet. */
export function shareCertificatePdf(cert: Pick<MileageCertificateSummary, "id" | "code">) {
  return downloadAndShareExport(
    `/certificates/${cert.id}/pdf`,
    `mileclear-mileage-record-${cert.code.slice(0, 8)}.pdf`,
    "application/pdf"
  );
}
