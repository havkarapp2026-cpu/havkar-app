/**
 * Public architecture / legal-boundary statement for HAVKAR Wallet.
 * Not legal advice — documents technical model and gated activities.
 */
"use strict";

const WALLET_ARCHITECTURE = Object.freeze({
  version: "2026-11-23",
  model: "non_custodial_plus_payment_facilitator_rails",
  sections: {
    havkar_finance_hub: {
      title: "HAVKAR finance hub",
      holds_customer_funds: false,
      description:
        "Shows real Stripe/Connect commerce settlements, commissions, and receipts for the signed-in user. Not an e-money balance."
    },
    stellar_noncustodial: {
      title: "Stellar non-custodial wallet",
      holds_customer_funds: false,
      key_control: "user_external_wallet_only",
      description:
        "User connects an external Stellar wallet. HAVKAR prepares reviewable XDR; the user signs in their wallet; HAVKAR never stores a secret key or recovery phrase."
    },
    havkar_payment_center: {
      title: "HAVKAR payment center",
      holds_customer_funds: false,
      description:
        "Goods/services payments via Stripe Connect destination charges and optional Stellar direct-split. Stripe/Connect and on-chain accounts hold funds — not an internal HAVKAR cash wallet."
    }
  },
  asset_control: {
    fiat_card_payments: "Stripe / Stripe Connect",
    seller_provider_destination: "Connected Stripe Express account",
    xlm: "User-controlled Stellar account (G… public key)",
    internal_wallets_table: "Ledger record only — fiat deposit/withdraw/P2P transfer OFF"
  },
  signing: {
    who_initiates: "User in HAVKAR UI",
    who_signs: "User via Stellar Wallets Kit / Albedo / WalletConnect",
    who_submits: "Browser after user signature (Horizon)",
    havkar_can_unilaterally_move_xlm: false
  },
  regulatory_notes: {
    disclaimer:
      "This is a technical architecture statement, not legal advice. Non-custodial labeling alone does not guarantee exemption under PSD2, MiCA (CASP), or Italian/EU rules.",
    psd2:
      "Payment initiation / account information services for fiat may require PI authorization or a licensed partner when HAVKAR acts as a payment institution.",
    mica:
      "Crypto-asset services for others (custody, transfer on behalf of clients, exchange) may require CASP authorization. User-signed non-custodial transfers still need case-by-case classification before public marketing as a transfer service.",
    italy_eu:
      "Operating from Italy/EU targeting consumers requires assessing Banca d’Italia / EU regimes for EMI, PI, and CASP. Do not enable free P2P fiat remittance or custodial crypto without a licensed partner.",
    gated_without_license: [
      "Internal fiat top-up / safeguarded e-money balance",
      "Internal fiat withdrawal to IBAN",
      "Free P2P euro transfers between users",
      "HAVKAR-operated crypto exchange / brokerage",
      "HAVKAR unilateral Stellar send without user wallet signature"
    ]
  },
  fiat_rails: {
    deposits_enabled: false,
    withdrawals_enabled: false,
    transfers_enabled: false,
    exchange_executable: false
  },
  scf_readiness: {
    non_custodial_connector: true,
    mainnet_collection_flag_supported: true,
    metrics_endpoint: "stellar_metrics (Owner)",
    claim_of_funding: false
  }
});

function getWalletArchitecture() {
  return {
    ok: true,
    generated_at: new Date().toISOString(),
    architecture: WALLET_ARCHITECTURE
  };
}

module.exports = {
  WALLET_ARCHITECTURE,
  getWalletArchitecture
};
