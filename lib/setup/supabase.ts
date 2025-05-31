import { exec } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { promisify } from 'node:util';
import readline from 'node:readline';
import path from 'node:path';

const execAsync = promisify(exec);

function question(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

async function checkSupabaseCLI() {
  console.log('Step 1: Checking if Supabase CLI is installed...');
  try {
    await execAsync('supabase --version');
    console.log('Supabase CLI is installed.');
  } catch (error) {
    console.error('Supabase CLI is not installed. Please install it and try again.');
    console.log('To install Supabase CLI:');
    console.log('npm install -g supabase');
    console.log('or visit: https://supabase.com/docs/guides/cli');
    process.exit(1);
  }
}

async function checkStripeCLI() {
  console.log('Step 2: Checking if Stripe CLI is installed...');
  try {
    await execAsync('stripe --version');
    console.log('Stripe CLI is installed.');

    // Check if Stripe CLI is authenticated
    try {
      await execAsync('stripe config --list');
      console.log('Stripe CLI is authenticated.');
    } catch (error) {
      console.log('Stripe CLI is not authenticated.');
      console.log('Please run: stripe login');
      const answer = await question('Have you completed the authentication? (y/n): ');
      if (answer.toLowerCase() !== 'y') {
        console.log('Please authenticate with Stripe CLI and run this script again.');
        process.exit(1);
      }
    }
  } catch (error) {
    console.error('Stripe CLI is not installed. Please install it and try again.');
    console.log('To install Stripe CLI, visit: https://docs.stripe.com/stripe-cli');
    process.exit(1);
  }
}

async function getSupabaseCredentials(): Promise<{
  url: string;
  anonKey: string;
  serviceKey: string;
}> {
  console.log('Step 3: Getting Supabase project credentials...');
  
  const hasProject = await question('Do you already have a Supabase project? (y/n): ');
  
  if (hasProject.toLowerCase() === 'y') {
    console.log('You can find your credentials in the Supabase Dashboard:');
    console.log('1. Go to https://supabase.com/dashboard');
    console.log('2. Select your project');
    console.log('3. Go to Settings > API');
    
    const url = await question('Enter your Project URL: ');
    const anonKey = await question('Enter your anon/public key: ');
    const serviceKey = await question('Enter your service_role key: ');
    
    return { url, anonKey, serviceKey };
  } else {
    console.log('Please create a new Supabase project:');
    console.log('1. Go to https://supabase.com/dashboard');
    console.log('2. Click "New Project"');
    console.log('3. Follow the setup wizard');
    console.log('4. Once created, get your credentials from Settings > API');
    
    const continueSetup = await question('Have you created a project and are ready to continue? (y/n): ');
    if (continueSetup.toLowerCase() !== 'y') {
      console.log('Please create a Supabase project and run this script again.');
      process.exit(1);
    }
    
    const url = await question('Enter your Project URL: ');
    const anonKey = await question('Enter your anon/public key: ');
    const serviceKey = await question('Enter your service_role key: ');
    
    return { url, anonKey, serviceKey };
  }
}

async function getStripeCredentials(): Promise<{
  secretKey: string;
  webhookSecret: string;
}> {
  console.log('Step 4: Getting Stripe credentials...');
  console.log('You can find your Stripe Secret Key at: https://dashboard.stripe.com/test/apikeys');
  
  const secretKey = await question('Enter your Stripe Secret Key: ');
  
  console.log('Creating Stripe webhook for local development...');
  try {
    const { stdout } = await execAsync('stripe listen --print-secret');
    const match = stdout.match(/whsec_[a-zA-Z0-9]+/);
    if (!match) {
      throw new Error('Failed to extract Stripe webhook secret');
    }
    console.log('Stripe webhook created successfully.');
    return { secretKey, webhookSecret: match[0] };
  } catch (error) {
    console.error('Failed to create Stripe webhook. Please create one manually.');
    const webhookSecret = await question('Enter your Stripe Webhook Secret (or leave blank): ');
    return { secretKey, webhookSecret };
  }
}

async function writeEnvFile(envVars: Record<string, string>) {
  console.log('Step 5: Writing environment variables to .env');
  const envContent = Object.entries(envVars)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  await fs.writeFile(path.join(process.cwd(), '.env'), envContent);
  console.log('.env file created with the necessary variables.');
}

async function linkSupabaseProject() {
  console.log('Step 6: Linking Supabase project...');
  
  const isLinked = await question('Is your local project already linked to Supabase? (y/n): ');
  
  if (isLinked.toLowerCase() !== 'y') {
    const projectRef = await question('Enter your Supabase project reference ID: ');
    
    try {
      await execAsync(`supabase link --project-ref ${projectRef}`);
      console.log('Successfully linked to Supabase project.');
    } catch (error) {
      console.error('Failed to link Supabase project. You may need to run this manually:');
      console.log(`supabase link --project-ref ${projectRef}`);
    }
  }
}

async function runMigrations() {
  console.log('Step 7: Running database migrations...');
  
  const runMigrations = await question('Do you want to apply database migrations now? (y/n): ');
  
  if (runMigrations.toLowerCase() === 'y') {
    try {
      await execAsync('supabase db push');
      console.log('Database migrations applied successfully.');
    } catch (error) {
      console.error('Failed to apply migrations. You can run this manually later:');
      console.log('supabase db push');
    }
  } else {
    console.log('Skipping migrations. You can run them later with: supabase db push');
  }
}

async function main() {
  console.log('🚀 Supabase SaaS Starter Setup');
  console.log('===============================\n');

  await checkSupabaseCLI();
  await checkStripeCLI();
  
  const supabaseCredentials = await getSupabaseCredentials();
  const stripeCredentials = await getStripeCredentials();
  
  const envVars = {
    // Supabase Configuration
    'NEXT_PUBLIC_SUPABASE_URL': supabaseCredentials.url,
    'NEXT_PUBLIC_SUPABASE_ANON_KEY': supabaseCredentials.anonKey,
    'SUPABASE_SERVICE_ROLE_KEY': supabaseCredentials.serviceKey,
    
    // Stripe Configuration
    'STRIPE_SECRET_KEY': stripeCredentials.secretKey,
    'STRIPE_WEBHOOK_SECRET': stripeCredentials.webhookSecret,
    
    // App Configuration
    'BASE_URL': 'http://localhost:3000'
  };

  await writeEnvFile(envVars);
  await linkSupabaseProject();
  await runMigrations();

  console.log('\n🎉 Setup completed successfully!');
  console.log('\nNext steps:');
  console.log('1. Run: npm run dev');
  console.log('2. In another terminal, run: stripe listen --forward-to localhost:3000/api/stripe/webhook');
  console.log('3. Visit: http://localhost:3000');
  console.log('\nYour SaaS starter is ready to go! 🚀');
}

if (require.main === module) {
  main().catch(console.error);
}

export { main as setupSupabase };