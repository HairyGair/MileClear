import { apiRequest } from "./index";
import type { FeedbackWithVoted, FeedbackReply, FeedbackCategory, FeedbackStatus, KnownIssueStatus, PaginatedResponse } from "@mileclear/shared";

export interface FeedbackListParams {
  page?: number;
  pageSize?: number;
  category?: FeedbackCategory;
  status?: FeedbackStatus;
  sort?: "newest" | "most_voted";
}

export function fetchFeedbackList(params?: FeedbackListParams) {
  const sp = new URLSearchParams();
  if (params?.page) sp.set("page", String(params.page));
  if (params?.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params?.category) sp.set("category", params.category);
  if (params?.status) sp.set("status", params.status);
  if (params?.sort) sp.set("sort", params.sort);
  const qs = sp.toString();
  return apiRequest<PaginatedResponse<FeedbackWithVoted>>(`/feedback${qs ? `?${qs}` : ""}`);
}

interface SubmitFeedbackData {
  displayName?: string;
  title: string;
  body: string;
  category: FeedbackCategory;
}

export function submitFeedback(data: SubmitFeedbackData) {
  return apiRequest<{ data: FeedbackWithVoted; message: string }>("/feedback", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function toggleFeedbackVote(id: string) {
  return apiRequest<{ data: { voted: boolean }; message: string }>(`/feedback/${id}/vote`, {
    method: "POST",
  });
}

export function updateFeedbackStatus(id: string, status: FeedbackStatus) {
  return apiRequest<{ data: FeedbackWithVoted; message: string }>(`/feedback/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function deleteFeedback(id: string) {
  return apiRequest<{ message: string }>(`/feedback/${id}`, {
    method: "DELETE",
  });
}

export function fetchFeedbackStats() {
  return apiRequest<{
    data: {
      total: number;
      byStatus: Record<string, number>;
      byCategory: Record<string, number>;
    };
  }>("/feedback/stats");
}

export function postFeedbackReply(feedbackId: string, body: string) {
  return apiRequest<{ data: FeedbackReply; message: string }>(`/feedback/${feedbackId}/reply`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function deleteFeedbackReply(replyId: string) {
  return apiRequest<{ message: string }>(`/feedback/reply/${replyId}`, {
    method: "DELETE",
  });
}

export function fetchKnownIssues() {
  return apiRequest<{ data: FeedbackWithVoted[] }>("/feedback/known-issues");
}

export function updateKnownIssue(id: string, isKnownIssue: boolean, knownIssueStatus: KnownIssueStatus | null) {
  return apiRequest<{ data: any; message: string }>(`/feedback/${id}/known-issue`, {
    method: "PATCH",
    body: JSON.stringify({ isKnownIssue, knownIssueStatus }),
  });
}
