interface InvoiceData {
  invoiceNumber: string
  date: string
  dueDate: string
  tenant: {
    name: string
    email: string
    phone: string
    address: string
  }
  property: {
    name: string
    unit: string
    address: string
  }
  items: {
    description: string
    amount: number
    quantity?: number
  }[]
  subtotal: number
  tax?: number
  total: number
  notes?: string
}

// Format currency in KSH
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function generateInvoiceHTML(data: InvoiceData): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invoice ${data.invoiceNumber}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          border-bottom: 2px solid #10b981;
          padding-bottom: 20px;
        }
        .logo {
          font-size: 24px;
          font-weight: bold;
          color: #10b981;
        }
        .invoice-info {
          text-align: right;
        }
        .invoice-number {
          font-size: 18px;
          font-weight: bold;
          color: #10b981;
        }
        .billing-info {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 30px;
          margin-bottom: 30px;
        }
        .billing-section h3 {
          color: #10b981;
          margin-bottom: 10px;
          font-size: 16px;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        .items-table th,
        .items-table td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #ddd;
        }
        .items-table th {
          background-color: #f8f9fa;
          font-weight: bold;
          color: #333;
        }
        .amount {
          text-align: right;
        }
        .totals {
          margin-left: auto;
          width: 300px;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
        }
        .total-row.final {
          border-top: 2px solid #10b981;
          font-weight: bold;
          font-size: 18px;
          color: #10b981;
        }
        .notes {
          margin-top: 30px;
          padding: 20px;
          background-color: #f8f9fa;
          border-left: 4px solid #10b981;
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          color: #666;
          font-size: 14px;
        }
        @media print {
          body {
            padding: 0;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">Swyft Agent</div>
        <div class="invoice-info">
          <div class="invoice-number">Invoice #${data.invoiceNumber}</div>
          <div>Date: ${new Date(data.date).toLocaleDateString("en-KE")}</div>
          <div>Due Date: ${new Date(data.dueDate).toLocaleDateString("en-KE")}</div>
        </div>
      </div>

      <div class="billing-info">
        <div class="billing-section">
          <h3>Bill To:</h3>
          <div><strong>${data.tenant.name}</strong></div>
          <div>${data.tenant.email}</div>
          <div>${data.tenant.phone}</div>
          <div>${data.tenant.address}</div>
        </div>
        <div class="billing-section">
          <h3>Property:</h3>
          <div><strong>${data.property.name}</strong></div>
          <div>Unit: ${data.property.unit}</div>
          <div>${data.property.address}</div>
        </div>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Quantity</th>
            <th class="amount">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${data.items
            .map(
              (item) => `
            <tr>
              <td>${item.description}</td>
              <td>${item.quantity || 1}</td>
              <td class="amount">${formatCurrency(item.amount)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>

      <div class="totals">
        <div class="total-row">
          <span>Subtotal:</span>
          <span>${formatCurrency(data.subtotal)}</span>
        </div>
        ${
          data.tax
            ? `
          <div class="total-row">
            <span>Tax:</span>
            <span>${formatCurrency(data.tax)}</span>
          </div>
        `
            : ""
        }
        <div class="total-row final">
          <span>Total:</span>
          <span>${formatCurrency(data.total)}</span>
        </div>
      </div>

      ${
        data.notes
          ? `
        <div class="notes">
          <h3>Notes:</h3>
          <p>${data.notes}</p>
        </div>
      `
          : ""
      }

      <div class="footer">
        <p>Thank you for your business!</p>
        <p>For questions about this invoice, please contact us at info@swyft-agent.com</p>
      </div>
    </body>
    </html>
  `
}

export function generateInvoicePDF(data: InvoiceData): Promise<Blob> {
  return new Promise((resolve) => {
    const html = generateInvoiceHTML(data)

    // Create a temporary iframe to render the HTML
    const iframe = document.createElement("iframe")
    iframe.style.position = "absolute"
    iframe.style.left = "-9999px"
    document.body.appendChild(iframe)

    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (doc) {
      doc.open()
      doc.write(html)
      doc.close()

      // Use the browser's print functionality to generate PDF
      iframe.contentWindow?.print()
    }

    // Clean up
    setTimeout(() => {
      document.body.removeChild(iframe)
    }, 1000)

    // For now, return the HTML as a blob
    // In a real implementation, you'd use a library like jsPDF or Puppeteer
    const blob = new Blob([html], { type: "text/html" })
    resolve(blob)
  })
}

export function downloadInvoice(data: InvoiceData, format: "html" | "pdf" = "html") {
  if (format === "html") {
    const html = generateInvoiceHTML(data)
    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `invoice-${data.invoiceNumber}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } else {
    generateInvoicePDF(data).then((blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `invoice-${data.invoiceNumber}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    })
  }
}

// Sample invoice data generator
export function generateSampleInvoice(): InvoiceData {
  const invoiceNumber = `INV-${Date.now()}`
  const date = new Date().toISOString().split("T")[0]
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

  return {
    invoiceNumber,
    date,
    dueDate,
    tenant: {
      name: "John Doe",
      email: "john.doe@email.com",
      phone: "+254 700 123 456",
      address: "123 Main Street, Nairobi, Kenya",
    },
    property: {
      name: "Westlands Complex",
      unit: "Apartment 3B",
      address: "Westlands Road, Nairobi, Kenya",
    },
    items: [
      {
        description: "Monthly Rent - January 2024",
        amount: 85000,
        quantity: 1,
      },
      {
        description: "Water & Electricity",
        amount: 12000,
        quantity: 1,
      },
      {
        description: "Service Charge",
        amount: 8000,
        quantity: 1,
      },
    ],
    subtotal: 105000,
    tax: 0, // No tax for residential rent in Kenya
    total: 105000,
    notes: "Payment is due within 30 days. Late payments may incur additional charges.",
  }
}

// Generate a unique, human-readable invoice number (e.g. INV-20240131-4821).
export function generateInvoiceNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const suffix = Math.floor(1000 + Math.random() * 9000)
  return `INV-${date}-${suffix}`
}
