# Next.js SaaS Starter

This is a starter template for building a SaaS application using **Next.js** with support for authentication, Stripe integration for payments, and a dashboard for logged-in users.

**Demo: [https://next-saas-start.vercel.app/](https://next-saas-start.vercel.app/)**

## Features

- Marketing landing page (`/`) with animated Terminal element
- Pricing page (`/pricing`) which connects to Stripe Checkout
- Dashboard pages with CRUD operations on users/teams
- Basic RBAC with Owner and Member roles
- Subscription management with Stripe Customer Portal
- Email/password authentication with JWTs stored to cookies
- Global middleware to protect logged-in routes
- Local middleware to protect Server Actions or validate Zod schemas
- Activity logging system for any user events

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/)
- **Database**: [Supabase](https://supabase.com/) (PostgreSQL + Auth + Real-time)
- **Authentication**: [Supabase Auth](https://supabase.com/auth)
- **Payments**: [Stripe](https://stripe.com/)
- **UI Library**: [shadcn/ui](https://ui.shadcn.com/)

## Getting Started

```bash
git clone https://github.com/nextjs/saas-starter
cd saas-starter
pnpm install
```

## Running Locally

First, set up your development environment:

1. **Install and authenticate with Stripe CLI:**
   ```bash
   stripe login
   ```

2. **Run the setup script to configure Supabase and Stripe:**
   ```bash
   pnpm setup
   ```
   This will guide you through:
   - Connecting to your Supabase project
   - Setting up environment variables
   - Configuring Stripe webhooks
   - Running database migrations

3. **Create your first user:**
   You can create new users through the `/sign-up` route once the app is running.

Finally, run the development server (this will start both Next.js and Stripe webhook listener):

```bash
pnpm dev
```

This will concurrently run:
- **Next.js dev server** on `http://localhost:3000`
- **Stripe webhook listener** for handling subscription events

Open [http://localhost:3000](http://localhost:3000) in your browser to see the app in action.

### Alternative Commands:
- `pnpm dev:next` - Run only Next.js (without Stripe webhooks)
- `pnpm dev:stripe` - Run only Stripe webhook listener

## Testing Payments

To test Stripe payments, use the following test card details:

- Card Number: `4242 4242 4242 4242`
- Expiration: Any future date
- CVC: Any 3-digit number

## Going to Production

When you're ready to deploy your SaaS application to production, follow these steps:

### Set up a production Stripe webhook

1. Go to the Stripe Dashboard and create a new webhook for your production environment.
2. Set the endpoint URL to your production API route (e.g., `https://yourdomain.com/api/stripe/webhook`).
3. Select the events you want to listen for (e.g., `checkout.session.completed`, `customer.subscription.updated`).

### Deploy to Vercel

1. Push your code to a GitHub repository.
2. Connect your repository to [Vercel](https://vercel.com/) and deploy it.
3. Follow the Vercel deployment process, which will guide you through setting up your project.

### Add environment variables

In your Vercel project settings (or during deployment), add all the necessary environment variables. Make sure to update the values for the production environment, including:

1. `BASE_URL`: Set this to your production domain.
2. `STRIPE_SECRET_KEY`: Use your Stripe secret key for the production environment.
3. `STRIPE_WEBHOOK_SECRET`: Use the webhook secret from the production webhook you created in step 1.
4. `NEXT_PUBLIC_SUPABASE_URL`: Set this to your production Supabase project URL.
5. `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Set this to your production Supabase anon key.
6. `SUPABASE_SERVICE_ROLE_KEY`: Set this to your production Supabase service role key.

## Other Templates

While this template is intentionally minimal and to be used as a learning resource, there are other paid versions in the community which are more full-featured:

- https://achromatic.dev
- https://shipfa.st
- https://makerkit.dev
- https://zerotoshipped.com
- https://turbostarter.dev
