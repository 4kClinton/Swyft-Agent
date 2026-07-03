"use client"

export default function PackagesPage(){
    return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 p-6">
        {/* <!-- Starter --> */}
        <div className="flex flex-col bg-[#00d460] rounded-3xl shadow-lg">
            <div className="px-6 py-8 sm:p-10 sm:pb-6">
            <h2 className="text-lg font-bold tracking-tight text-white lg:text-2xl">Starter</h2>
            <p className="mt-2 text-sm text-white">For small landlords or beginner PMs</p>
            <div className="mt-6">
                <p>
                <span className="text-4xl font-extrabold text-white">KSh 1,999</span>
                <span className="text-base font-medium text-white"> / month</span>
                </p>
            </div>
            <ul className="mt-6 space-y-2 text-white text-sm">
                <li>✅ Manage 0–30 Units</li>
                <li>✅ Residential Properties</li>
                <li>✅ Basic Reports & Analytics</li>
                <li>✅ Vacant Units Auto-listed on Swyft</li>
                <li>✅ SMS & Email Notifications</li>
                <li>✅ Basic Tenant Screening</li>
            </ul>
            </div>
            <div className="flex px-6 pb-8 sm:px-8 mt-auto">
            <a href="#"
                className="items-center justify-center w-full px-6 py-2.5 text-center text-[#00d460] duration-200 bg-card border-2 border-white rounded-full inline-flex hover:bg-transparent hover:text-white">
                Get started
            </a>
            </div>
        </div>

        {/* <!-- Basic --> */}
        <div className="flex flex-col bg-[#00d460] rounded-3xl shadow-lg">
            <div className="px-6 py-8 sm:p-10 sm:pb-6">
            <h2 className="text-lg font-bold tracking-tight text-white lg:text-2xl">Basic</h2>
            <p className="mt-2 text-sm text-white">For small-to-mid sized PMs growing their portfolio</p>
            <div className="mt-6">
                <p>
                <span className="text-4xl font-extrabold text-white">KSh 3,499</span>
                <span className="text-base font-medium text-white"> / month</span>
                </p>
            </div>
            <ul className="mt-6 space-y-2 text-white text-sm">
                <li>✅ Manage 31–50 Units</li>
                <li>✅ Residential & Commercial Properties</li>
                <li>✅ Basic + Advanced Reports</li>
                <li>✅ Automated Rent Reminders</li>
                <li>✅ Vacant Units Auto-listed on Swyft</li>
                <li>✅ SMS & Email Notifications</li>
                <li>✅ 24/7 Online Support</li>
            </ul>
            </div>
            <div className="flex px-6 pb-8 sm:px-8 mt-auto">
            <a href="#"
                className="items-center justify-center w-full px-6 py-2.5 text-center text-[#00d460] duration-200 bg-card border-2 border-white rounded-full inline-flex hover:bg-transparent hover:text-white">
                Get started
            </a>
            </div>
        </div>

        {/* <!-- Premium --> */}
        <div className="flex flex-col bg-[#00d460] rounded-3xl shadow-lg">
            <div className="px-6 py-8 sm:p-10 sm:pb-6">
            <h2 className="text-lg font-bold tracking-tight text-white lg:text-2xl">Premium</h2>
            <p className="mt-2 text-sm text-white">For established PMs scaling operations</p>
            <div className="mt-6">
                <p>
                <span className="text-4xl font-extrabold text-white">KSh 5,500</span>
                <span className="text-base font-medium text-white"> / month</span>
                </p>
            </div>
            <ul className="mt-6 space-y-2 text-white text-sm">
                <li>✅ Manage 51–100 Units</li>
                <li>✅ Advanced Reports & Analytics Dashboard</li>
                <li>✅ Residential & Commercial Properties</li>
                <li>✅ Automated Rent Reconciliation (M-Pesa mirroring)</li>
                <li>✅ Ratiba Auto-Billing Setup</li>
                <li>✅ Vacant Units Auto-listed on Swyft</li>
                <li>✅ SMS & Email Notifications</li>
                <li>✅ Enhanced 24/7 Support</li>
            </ul>
            </div>
            <div className="flex px-6 pb-8 sm:px-8 mt-auto">
            <a href="#"
                className="items-center justify-center w-full px-6 py-2.5 text-center text-[#00d460] duration-200 bg-card border-2 border-white rounded-full inline-flex hover:bg-transparent hover:text-white">
                Get started
            </a>
            </div>
        </div>

        {/* <!-- Gold --> */}
        <div className="flex flex-col bg-[#00d460] rounded-3xl shadow-lg">
            <div className="px-6 py-8 sm:p-10 sm:pb-6">
            <h2 className="text-lg font-bold tracking-tight text-white lg:text-2xl">Gold (Enterprise)</h2>
            <p className="mt-2 text-sm text-white">For large PMs, enterprises, mixed portfolios</p>
            <div className="mt-6">
                <p>
                <span className="text-4xl font-extrabold text-white">KSh 7,999</span>
                <span className="text-base font-medium text-white"> / month</span>
                </p>
            </div>
            <ul className="mt-6 space-y-2 text-white text-sm">
                <li>✅ Unlimited Units (Residential, Commercial, Standalones)</li>
                <li>✅ Comprehensive Reports & Predictive Analytics</li>
                <li>✅ Automated Rent Reconciliation (M-Pesa mirroring)</li>
                <li>✅ Custom Integrations (ERP, CRMs, Paybills, Accounting Systems)</li>
                <li>✅ Vacant Units Auto-listed on Swyft</li>
                <li>✅ Priority 24/7 Dedicated Support</li>
                <li>✅ Dedicated Account Manager</li>
                <li>✅ Social Media Listing Integration (Included)</li>
            </ul>
            </div>
            <div className="flex px-6 pb-8 sm:px-8 mt-auto">
            <a href="#"
                className="items-center justify-center w-full px-6 py-2.5 text-center text-[#00d460] duration-200 bg-card border-2 border-white rounded-full inline-flex hover:bg-transparent hover:text-white">
                Get started
            </a>
            </div>
        </div>
    </div>
    )
}