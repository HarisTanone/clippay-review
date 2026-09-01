"use client";

import React, { useState, useEffect, useCallback } from "react";
import styles from "./review.module.css";
import { formatRupiah, formatNumber } from "@/lib/finance";

interface SubmissionItem {
  id: number;
  creator: {
    id: number;
    username: string;
    email: string;
  };
  campaign: {
    id: number;
    title: string;
    brand: string;
    cpm: number;
    remaining_budget: number;
    status: string;
  };
  platform: "tiktok" | "instagram" | "youtube";
  video_url: string;
  views: number;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  reviewed_at: string | null;
  calculation: {
    gross: number;
    fee: number;
    net: number;
  };
}

interface PaginationMeta {
  page: number;
  per: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

interface CampaignOption {
  id: number;
  title: string;
  brand: string;
  cpm: number;
  remaining_budget: number;
  total_budget: number;
  status: string;
}

interface CampaignSummaryData {
  campaign: {
    id: number;
    title: string;
    brand: string;
    cpm: number;
    total_budget: number;
    remaining_budget: number;
    spent_budget: number;
    status: string;
  };
  submissions_summary: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
  earnings_summary: {
    total_gross_paid: number;
    total_platform_fee: number;
    total_net_paid: number;
  };
}

interface ToastMessage {
  id: string;
  type: "success" | "error";
  text: string;
}

// Clean minimalist SVG icons (no emojis)
const SearchIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const ChartIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

export default function ReviewPage() {
  // Filter & Pagination States
  const [page, setPage] = useState<number>(1);
  const [perPage, setPerPage] = useState<number>(20);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [campaignFilter, setCampaignFilter] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");

  // Data States
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    per: 20,
    total: 0,
    total_pages: 0,
    has_next: false,
    has_prev: false,
  });
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);

  // UI States
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Action States
  const [selectedSubmission, setSelectedSubmission] =
    useState<SubmissionItem | null>(null);
  const [isApproving, setIsApproving] = useState<boolean>(false);

  // Campaign Summary Modal States
  const [summaryCampaignId, setSummaryCampaignId] = useState<number | null>(
    null
  );
  const [summaryData, setSummaryData] = useState<CampaignSummaryData | null>(
    null
  );
  const [isLoadingSummary, setIsLoadingSummary] = useState<boolean>(false);

  // Search Debouncing
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchInput]);

  const addToast = (type: "success" | "error", text: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  // Fetch Campaigns Dropdown
  useEffect(() => {
    async function loadCampaigns() {
      try {
        const res = await fetch("/api/campaigns");
        if (res.ok) {
          const json = await res.json();
          setCampaigns(json.campaigns || []);
        }
      } catch (err) {
        console.error("Gagal memuat list campaign:", err);
      }
    }
    loadCampaigns();
  }, []);

  // Fetch Submissions Data
  const fetchSubmissions = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("per", perPage.toString());
      if (statusFilter && statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      if (campaignFilter) {
        params.set("campaignId", campaignFilter);
      }
      if (debouncedSearch) {
        params.set("search", debouncedSearch);
      }

      const response = await fetch(`/api/submissions?${params.toString()}`);

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(
          errJson.error || `HTTP ${response.status}: Gagal memuat data`
        );
      }

      const json = await response.json();
      setSubmissions(json.data || []);
      setPagination(
        json.pagination || {
          page: 1,
          per: perPage,
          total: 0,
          total_pages: 0,
          has_next: false,
          has_prev: false,
        }
      );
    } catch (err: any) {
      setErrorMessage(err.message || "Terjadi kendala saat memuat data.");
    } finally {
      setIsLoading(false);
    }
  }, [page, perPage, statusFilter, campaignFilter, debouncedSearch]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  // Handle Approve
  const handleConfirmApprove = async () => {
    if (!selectedSubmission || isApproving) return;

    setIsApproving(true);
    try {
      const res = await fetch(
        `/api/submissions/${selectedSubmission.id}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Gagal menyetujui submission.");
      }

      addToast(
        "success",
        `Submission #${selectedSubmission.id} disetujui. Earning net Rp${data.earning.net_amount.toLocaleString(
          "id-ID"
        )} dialokasikan.`
      );

      setSelectedSubmission(null);

      // Mutasi optimistik pada baris lokal
      setSubmissions((prev) =>
        prev.map((sub) =>
          sub.id === selectedSubmission.id
            ? {
                ...sub,
                status: "approved",
                reviewed_at: new Date().toISOString(),
                campaign: {
                  ...sub.campaign,
                  remaining_budget: data.campaign.new_remaining_budget,
                },
              }
            : sub
        )
      );
    } catch (err: any) {
      addToast("error", err.message || "Terjadi kesalahan saat approve.");
    } finally {
      setIsApproving(false);
    }
  };

  // Open Campaign Summary Modal
  const handleOpenSummary = async (campaignId: number) => {
    setSummaryCampaignId(campaignId);
    setIsLoadingSummary(true);
    setSummaryData(null);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/summary`);
      if (!res.ok) throw new Error("Gagal mengambil ringkasan campaign.");
      const json = await res.json();
      setSummaryData(json);
    } catch (err: any) {
      addToast("error", err.message || "Gagal memuat ringkasan.");
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const handleResetFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setStatusFilter("all");
    setCampaignFilter("");
    setPage(1);
  };

  return (
    <div className={styles.pageWrapper}>
      {/* Top Navbar */}
      <nav className={styles.topNavigation}>
        <div className={styles.topNavInner}>
          <div className={styles.brandGroup}>
            <span className={styles.brandLogo}>ClipPay</span>
            <div className={styles.navDivider} />
            <span className={styles.navSectionName}>Review Submissions</span>
          </div>

          <div className={styles.navActions}>
            <button
              className={styles.summaryButton}
              onClick={() => handleOpenSummary(campaigns[0]?.id || 1)}
            >
              <ChartIcon />
              <span>Ringkasan Campaign</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className={styles.mainContent}>
        {/* Page Header */}
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Review & Verifikasi Submission</h1>
          <p className={styles.pageSubtitle}>
            Tinjau submission creator, hitung earning otomatis, dan alokasikan budget campaign secara aman.
          </p>
        </div>

        {/* Filter Bar */}
        <section className={styles.filterBar}>
          <div className={styles.filterControls}>
            {/* Search Input */}
            <div className={styles.searchWrapper}>
              <div className={styles.searchIconWrapper}>
                <SearchIcon />
              </div>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Cari username creator..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>

            {/* Segmented Status Tabs */}
            <div className={styles.segmentedControl}>
              {[
                { id: "all", label: "Semua" },
                { id: "pending", label: "Pending" },
                { id: "approved", label: "Approved" },
                { id: "rejected", label: "Rejected" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  className={`${styles.segmentButton} ${
                    statusFilter === tab.id ? styles.segmentButtonActive : ""
                  }`}
                  onClick={() => {
                    setStatusFilter(tab.id);
                    setPage(1);
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Campaign Dropdown */}
            <select
              className={styles.selectDropdown}
              value={campaignFilter}
              onChange={(e) => {
                setCampaignFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua Campaign</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>

            {/* Per Page Dropdown */}
            <select
              className={styles.selectDropdown}
              style={{ minWidth: "90px" }}
              value={perPage}
              onChange={(e) => {
                setPerPage(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={10}>10 baris</option>
              <option value={20}>20 baris</option>
              <option value={50}>50 baris</option>
            </select>

            {(searchInput ||
              statusFilter !== "pending" ||
              campaignFilter) && (
              <button
                className={styles.resetButton}
                onClick={handleResetFilters}
              >
                Reset Filter
              </button>
            )}
          </div>
        </section>

        {/* Data Table */}
        <section className={styles.tableContainer}>
          <div className={styles.tableScrollArea}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th style={{ width: "60px" }}>ID</th>
                  <th>Creator</th>
                  <th>Campaign</th>
                  <th>Platform</th>
                  <th style={{ textAlign: "right" }}>Views</th>
                  <th style={{ textAlign: "right" }}>Earning Kotor</th>
                  <th style={{ textAlign: "right" }}>Net Creator</th>
                  <th>Status</th>
                  <th>Tanggal</th>
                  <th style={{ textAlign: "right" }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={`skel-${i}`}>
                      <td>
                        <div
                          className="skeleton"
                          style={{ height: "16px", width: "36px" }}
                        />
                      </td>
                      <td>
                        <div
                          className="skeleton"
                          style={{
                            height: "16px",
                            width: "110px",
                            marginBottom: "4px",
                          }}
                        />
                        <div
                          className="skeleton"
                          style={{ height: "12px", width: "80px" }}
                        />
                      </td>
                      <td>
                        <div
                          className="skeleton"
                          style={{
                            height: "16px",
                            width: "140px",
                            marginBottom: "4px",
                          }}
                        />
                        <div
                          className="skeleton"
                          style={{ height: "12px", width: "90px" }}
                        />
                      </td>
                      <td>
                        <div
                          className="skeleton"
                          style={{ height: "18px", width: "60px" }}
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div
                          className="skeleton"
                          style={{
                            height: "16px",
                            width: "60px",
                            marginLeft: "auto",
                          }}
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div
                          className="skeleton"
                          style={{
                            height: "16px",
                            width: "75px",
                            marginLeft: "auto",
                          }}
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div
                          className="skeleton"
                          style={{
                            height: "16px",
                            width: "75px",
                            marginLeft: "auto",
                          }}
                        />
                      </td>
                      <td>
                        <div
                          className="skeleton"
                          style={{ height: "20px", width: "68px" }}
                        />
                      </td>
                      <td>
                        <div
                          className="skeleton"
                          style={{ height: "14px", width: "75px" }}
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div
                          className="skeleton"
                          style={{
                            height: "26px",
                            width: "70px",
                            marginLeft: "auto",
                          }}
                        />
                      </td>
                    </tr>
                  ))
                ) : errorMessage ? (
                  <tr>
                    <td colSpan={10}>
                      <div className={styles.feedbackState}>
                        <h3 className={styles.feedbackTitle}>Gagal Memuat Data</h3>
                        <p className={styles.feedbackSubtitle}>{errorMessage}</p>
                        <button
                          className={styles.feedbackButton}
                          onClick={fetchSubmissions}
                        >
                          Coba Lagi
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : submissions.length === 0 ? (
                  <tr>
                    <td colSpan={10}>
                      <div className={styles.feedbackState}>
                        <h3 className={styles.feedbackTitle}>
                          Tidak Ada Submission Ditemukan
                        </h3>
                        <p className={styles.feedbackSubtitle}>
                          Tidak ada data yang sesuai dengan filter atau kata kunci saat ini.
                        </p>
                        <button
                          className={styles.feedbackButton}
                          onClick={handleResetFilters}
                        >
                          Reset Filter
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  submissions.map((sub) => {
                    const isPending = sub.status === "pending";
                    const canAfford =
                      sub.campaign.remaining_budget >= sub.calculation.gross;

                    return (
                      <tr key={sub.id}>
                        <td style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                          #{sub.id}
                        </td>
                        <td>
                          <div>
                            <span className={styles.creatorUsername}>
                              {sub.creator.username}
                            </span>
                            <span className={styles.creatorEmail}>
                              {sub.creator.email}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div>
                            <div
                              className={styles.campaignName}
                              title={sub.campaign.title}
                            >
                              {sub.campaign.title}
                            </div>
                            <div className={styles.campaignDetails}>
                              {sub.campaign.brand} &middot; CPM {formatRupiah(sub.campaign.cpm)}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span className={styles.platformBadge}>
                              {sub.platform}
                            </span>
                            <a
                              href={sub.video_url}
                              target="_blank"
                              rel="noreferrer"
                              className={styles.externalLink}
                              title={sub.video_url}
                            >
                              <span>Video</span>
                              <ExternalLinkIcon />
                            </a>
                          </div>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <span className={styles.textNumeric}>
                            {formatNumber(sub.views)}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <span className={styles.earningGross}>
                            {formatRupiah(sub.calculation.gross)}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <span className={styles.earningNet}>
                            {formatRupiah(sub.calculation.net)}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`${styles.statusBadge} ${
                              sub.status === "approved"
                                ? styles.statusApproved
                                : sub.status === "rejected"
                                ? styles.statusRejected
                                : styles.statusPending
                            }`}
                          >
                            {sub.status}
                          </span>
                        </td>
                        <td style={{ color: "var(--text-secondary)", fontSize: "12px", whiteSpace: "nowrap" }}>
                          {new Date(sub.submitted_at).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {isPending ? (
                            <button
                              className={styles.actionButton}
                              onClick={() => setSelectedSubmission(sub)}
                              disabled={!canAfford}
                              title={
                                !canAfford
                                  ? `Sisa budget (${formatRupiah(
                                      sub.campaign.remaining_budget
                                    )}) tidak cukup untuk bayar kotor ${formatRupiah(
                                      sub.calculation.gross
                                    )}`
                                  : "Review dan Approve"
                              }
                            >
                              Approve
                            </button>
                          ) : (
                            <span
                              style={{
                                fontSize: "12px",
                                color: "var(--text-muted)",
                              }}
                            >
                              Selesai
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {!isLoading && !errorMessage && pagination.total > 0 && (
            <div className={styles.paginationBar}>
              <div className={styles.paginationText}>
                Menampilkan {(page - 1) * perPage + 1} &ndash;{" "}
                {Math.min(page * perPage, pagination.total)} dari{" "}
                {formatNumber(pagination.total)} submission
              </div>

              <div className={styles.paginationNav}>
                <button
                  className={styles.navButton}
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  title="Halaman Pertama"
                >
                  Pertama
                </button>
                <button
                  className={styles.navButton}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={!pagination.has_prev}
                  title="Sebelumnya"
                >
                  Sebelumnya
                </button>

                {Array.from({ length: Math.min(pagination.total_pages, 5) }).map(
                  (_, idx) => {
                    let targetPage = page - 2 + idx;
                    if (page <= 2) targetPage = idx + 1;
                    if (page >= pagination.total_pages - 2) {
                      targetPage = pagination.total_pages - 4 + idx;
                    }
                    if (targetPage < 1 || targetPage > pagination.total_pages) {
                      return null;
                    }

                    return (
                      <button
                        key={targetPage}
                        className={`${styles.navButton} ${
                          page === targetPage ? styles.navButtonActive : ""
                        }`}
                        onClick={() => setPage(targetPage)}
                      >
                        {targetPage}
                      </button>
                    );
                  }
                )}

                <button
                  className={styles.navButton}
                  onClick={() =>
                    setPage((p) => Math.min(p + 1, pagination.total_pages))
                  }
                  disabled={!pagination.has_next}
                  title="Berikutnya"
                >
                  Berikutnya
                </button>
                <button
                  className={styles.navButton}
                  onClick={() => setPage(pagination.total_pages)}
                  disabled={page === pagination.total_pages}
                  title="Halaman Terakhir"
                >
                  Terakhir
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Approval Confirmation Dialog */}
        {selectedSubmission && (
          <div className={styles.dialogOverlay}>
            <div className={styles.dialogBox}>
              <div className={styles.dialogHeader}>
                <h2 className={styles.dialogTitle}>Konfirmasi Persetujuan</h2>
                <button
                  className={styles.dialogClose}
                  onClick={() => !isApproving && setSelectedSubmission(null)}
                  disabled={isApproving}
                >
                  &times;
                </button>
              </div>

              <p className={styles.dialogDescription}>
                Persetujuan untuk submission #{selectedSubmission.id} dari{" "}
                <strong>{selectedSubmission.creator.username}</strong> akan memotong
                budget campaign dan mencatat baris earning creator.
              </p>

              <div className={styles.financialSummary}>
                <div className={styles.summaryRow}>
                  <span>Campaign</span>
                  <strong>{selectedSubmission.campaign.title}</strong>
                </div>
                <div className={styles.summaryRow}>
                  <span>Views Video</span>
                  <strong>{formatNumber(selectedSubmission.views)}</strong>
                </div>
                <div className={styles.summaryRow}>
                  <span>CPM</span>
                  <strong>{formatRupiah(selectedSubmission.campaign.cpm)}</strong>
                </div>

                <div className={styles.summaryDivider} />

                <div className={styles.summaryRow}>
                  <span>Earning Kotor</span>
                  <strong>{formatRupiah(selectedSubmission.calculation.gross)}</strong>
                </div>
                <div className={styles.summaryRow}>
                  <span>Fee Platform (20%)</span>
                  <strong>{formatRupiah(selectedSubmission.calculation.fee)}</strong>
                </div>
                <div className={styles.summaryRow}>
                  <span>Net Creator</span>
                  <strong style={{ color: "var(--status-approved-text)" }}>
                    {formatRupiah(selectedSubmission.calculation.net)}
                  </strong>
                </div>

                <div className={styles.summaryDivider} />

                <div className={styles.summaryRow}>
                  <span>Sisa Budget Saat Ini</span>
                  <strong>{formatRupiah(selectedSubmission.campaign.remaining_budget)}</strong>
                </div>
                <div className={styles.summaryRow}>
                  <span>Sisa Budget Setelah Approval</span>
                  <strong>
                    {formatRupiah(
                      selectedSubmission.campaign.remaining_budget -
                        selectedSubmission.calculation.gross
                    )}
                  </strong>
                </div>
              </div>

              {selectedSubmission.campaign.remaining_budget <
                selectedSubmission.calculation.gross && (
                <div className={styles.budgetWarningBox}>
                  Sisa budget campaign tidak mencukupi untuk pembayaran ini. Approval akan ditolak sistem.
                </div>
              )}

              <div className={styles.dialogFooter}>
                <button
                  className={styles.secondaryButton}
                  onClick={() => setSelectedSubmission(null)}
                  disabled={isApproving}
                >
                  Batal
                </button>
                <button
                  className={styles.confirmApproveButton}
                  onClick={handleConfirmApprove}
                  disabled={
                    isApproving ||
                    selectedSubmission.campaign.remaining_budget <
                      selectedSubmission.calculation.gross
                  }
                >
                  {isApproving ? "Memproses..." : "Setujui Submission"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Campaign Summary Dialog (Bonus B3) */}
        {summaryCampaignId !== null && (
          <div className={styles.dialogOverlay}>
            <div className={styles.dialogBox} style={{ maxWidth: "540px" }}>
              <div className={styles.dialogHeader}>
                <h2 className={styles.dialogTitle}>Ringkasan Campaign</h2>
                <button
                  className={styles.dialogClose}
                  onClick={() => setSummaryCampaignId(null)}
                >
                  &times;
                </button>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    color: "var(--text-muted)",
                    marginBottom: "4px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Pilih Campaign
                </label>
                <select
                  className={styles.selectDropdown}
                  style={{ width: "100%" }}
                  value={summaryCampaignId}
                  onChange={(e) => handleOpenSummary(Number(e.target.value))}
                >
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} &ndash; {c.brand}
                    </option>
                  ))}
                </select>
              </div>

              {isLoadingSummary ? (
                <div style={{ padding: "20px 0" }}>
                  <div
                    className="skeleton"
                    style={{ height: "120px", width: "100%" }}
                  />
                </div>
              ) : summaryData ? (
                <div className={styles.financialSummary}>
                  <div className={styles.summaryRow}>
                    <span>Total Budget</span>
                    <strong>{formatRupiah(summaryData.campaign.total_budget)}</strong>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Sisa Budget</span>
                    <strong style={{ color: "var(--status-approved-text)" }}>
                      {formatRupiah(summaryData.campaign.remaining_budget)}
                    </strong>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Status Campaign</span>
                    <strong style={{ textTransform: "capitalize" }}>
                      {summaryData.campaign.status}
                    </strong>
                  </div>

                  <div className={styles.summaryDivider} />

                  <div className={styles.summaryRow}>
                    <span>Total Submission</span>
                    <strong>{formatNumber(summaryData.submissions_summary.total)}</strong>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Approved</span>
                    <strong>{formatNumber(summaryData.submissions_summary.approved)}</strong>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Pending</span>
                    <strong>{formatNumber(summaryData.submissions_summary.pending)}</strong>
                  </div>

                  <div className={styles.summaryDivider} />

                  <div className={styles.summaryRow}>
                    <span>Total Terbayar (Kotor)</span>
                    <strong>{formatRupiah(summaryData.earnings_summary.total_gross_paid)}</strong>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Total Net Creator</span>
                    <strong style={{ color: "var(--status-approved-text)" }}>
                      {formatRupiah(summaryData.earnings_summary.total_net_paid)}
                    </strong>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Fee Platform (20%)</span>
                    <strong>{formatRupiah(summaryData.earnings_summary.total_platform_fee)}</strong>
                  </div>
                </div>
              ) : null}

              <div className={styles.dialogFooter}>
                <button
                  className={styles.secondaryButton}
                  onClick={() => setSummaryCampaignId(null)}
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast Alerts */}
        <div className={styles.toastContainer}>
          {toasts.map((toast) => (
            <div key={toast.id} className={styles.toastCard}>
              <div
                className={
                  toast.type === "success"
                    ? styles.toastIndicatorSuccess
                    : styles.toastIndicatorError
                }
              />
              <span>{toast.text}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
