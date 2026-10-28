<?php

namespace Database\Seeders;

use App\Models\AssetModel;
use App\Models\Category;
use App\Models\Location;
use App\Models\Manufacturer;
use App\Models\Setting;
use App\Models\Statuslabel;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Passport\ClientRepository;
use Laravel\Passport\Passport;
use RuntimeException;

/**
 * Baseline data for the Playwright end-to-end tests in tests/e2e.
 *
 * Creates the settings row (so the /setup wizard never opens), a superuser to
 * log in as, and the named records the specs rely on: the "Ready to Deploy"
 * status label, the "E2E Laptops" category, "E2E Manufacturer", the
 * "E2E Laptop Model" asset model, the "E2E Office" location and the
 * "E2E Assignee" user to check assets out to.
 *
 * It is idempotent: records are looked up by name and created only when
 * missing, nothing is truncated, and it can run before every test run against
 * a database that already holds data. It uses models rather than factories so
 * it also works on installs without dev dependencies.
 *
 * CI (.github/workflows/tests-e2e.yml) runs it after migrating:
 *
 *     E2E_ADMIN_PASSWORD=... php artisan db:seed --class=E2eSeeder --force
 *
 * E2E_ADMIN_USERNAME (default "e2e-admin") and E2E_ADMIN_PASSWORD (required)
 * set the superuser's credentials; the password is re-applied on every run.
 */
class E2eSeeder extends Seeder
{
    public function run(): void
    {
        $admin = $this->admin();
        $this->settings($admin);
        $this->personalAccessClient();

        $this->readyToDeployStatus($admin);
        $category = $this->category($admin);
        $manufacturer = $this->manufacturer($admin);
        $this->assetModel($admin, $category, $manufacturer);
        $this->location($admin);
        $this->assignee($admin);

        if (! config('passport.private_key') && ! file_exists(Passport::keyPath('oauth-private.key'))) {
            $this->command?->warn('Passport keys are missing: run `php artisan passport:keys`, or the UI\'s own /api/v1 calls (lists, select boxes) will fail.');
        }
    }

    private function admin(): User
    {
        $username = env('E2E_ADMIN_USERNAME', 'e2e-admin');
        $password = env('E2E_ADMIN_PASSWORD');

        if (! is_string($password) || $password === '') {
            throw new RuntimeException('E2eSeeder: set E2E_ADMIN_PASSWORD to the password the e2e admin should log in with.');
        }

        $user = User::withTrashed()->firstOrNew(['username' => $username]);

        if ($user->trashed()) {
            $user->restore();
        }

        $user->first_name = 'E2E';
        $user->last_name = 'Admin';
        $user->email = 'e2e-admin@example.com';
        $user->activated = 1;
        $user->show_in_list = 1;
        $user->locale = 'en-US';
        $user->permissions = json_encode(['superuser' => 1]);

        if (! $this->passwordMatches($password, $user->password)) {
            $user->password = bcrypt($password);
        }

        return $this->persist($user, "admin user {$username}");
    }

    /**
     * Mirrors the row SetupController::postSaveFirstAdmin() writes. The setup
     * wizard stays open until both a user and a settings row exist
     * (Setting::setupCompleted()). An existing row is left untouched.
     */
    private function settings(User $admin): void
    {
        if (Setting::first()) {
            return;
        }

        $settings = new Setting;
        $settings->site_name = 'Snipe-IT E2E';
        $settings->alert_email = $admin->email;
        $settings->alerts_enabled = 0;
        $settings->pwd_secure_min = 10;
        $settings->brand = 1;
        $settings->link_light_color = '#296282';
        $settings->link_dark_color = '#296282';
        $settings->nav_link_color = '#FFFFFF';
        $settings->locale = 'en-US';
        $settings->default_currency = 'USD';
        $settings->created_by = $admin->id;
        $settings->full_multiple_companies_support = 0;
        $settings->next_auto_tag_base = 1;
        $settings->auto_increment_assets = 1;
        $settings->auto_increment_prefix = 'E2E-';
        $settings->zerofill_count = 5;

        $this->persist($settings, 'settings');
    }

    /**
     * Personal API tokens (Account > API Keys) need a personal access client.
     * The setup wizard gets one from `passport:install`; a migrated-only
     * database has none.
     */
    private function personalAccessClient(): void
    {
        if (Passport::personalAccessClient()->exists()) {
            return;
        }

        app(ClientRepository::class)->createPersonalAccessClient(null, 'E2E Personal Access Client', config('app.url'));
    }

    /**
     * The status-label migrations already insert a deployable "Ready to
     * Deploy"; this only creates it (or makes it deployable) when it is gone.
     */
    private function readyToDeployStatus(User $admin): void
    {
        $status = Statuslabel::firstOrNew(['name' => 'Ready to Deploy']);

        if ($status->exists && $status->deployable && ! $status->pending && ! $status->archived) {
            return;
        }

        $status->deployable = 1;
        $status->pending = 0;
        $status->archived = 0;
        $status->created_by ??= $admin->id;

        $this->persist($status, 'status label Ready to Deploy');
    }

    private function category(User $admin): Category
    {
        $category = Category::firstOrNew(['name' => 'E2E Laptops', 'category_type' => 'asset']);

        if (! $category->exists) {
            // No acceptance, EULA or check-in email, so checkouts complete
            // without mail or an acceptance step.
            $category->require_acceptance = false;
            $category->use_default_eula = false;
            $category->checkin_email = false;
            $category->created_by = $admin->id;
            $this->persist($category, 'category E2E Laptops');
        }

        return $category;
    }

    private function manufacturer(User $admin): Manufacturer
    {
        $manufacturer = Manufacturer::firstOrNew(['name' => 'E2E Manufacturer']);

        if (! $manufacturer->exists) {
            $manufacturer->created_by = $admin->id;
            $this->persist($manufacturer, 'manufacturer E2E Manufacturer');
        }

        return $manufacturer;
    }

    private function assetModel(User $admin, Category $category, Manufacturer $manufacturer): void
    {
        $model = AssetModel::firstOrNew(['name' => 'E2E Laptop Model']);

        if ($model->exists && $model->category_id == $category->id && $model->manufacturer_id == $manufacturer->id) {
            return;
        }

        $model->category_id = $category->id;
        $model->manufacturer_id = $manufacturer->id;
        $model->require_serial = 0;
        $model->created_by ??= $admin->id;

        $this->persist($model, 'asset model E2E Laptop Model');
    }

    private function location(User $admin): void
    {
        $location = Location::firstOrNew(['name' => 'E2E Office']);

        if (! $location->exists) {
            $location->created_by = $admin->id;
            $this->persist($location, 'location E2E Office');
        }
    }

    private function assignee(User $admin): void
    {
        $user = User::withTrashed()->firstOrNew(['username' => 'e2e-assignee']);

        if ($user->trashed()) {
            $user->restore();
        }

        if ($user->exists && $user->activated && $user->show_in_list
            && $user->first_name === 'E2E' && $user->last_name === 'Assignee') {
            return;
        }

        $user->first_name = 'E2E';
        $user->last_name = 'Assignee';
        $user->email ??= 'e2e-assignee@example.com';
        $user->activated = 1;
        // The checkout user picker only lists users with show_in_list = 1.
        $user->show_in_list = 1;
        $user->locale ??= 'en-US';
        $user->permissions ??= '{}';
        // Nobody logs in as this user; it only needs a valid password hash.
        $user->password ??= bcrypt(Str::random(40));
        $user->created_by ??= $admin->id;

        $this->persist($user, 'user e2e-assignee');
    }

    private function passwordMatches(string $password, ?string $hash): bool
    {
        if (! $hash) {
            return false;
        }

        try {
            return Hash::check($password, $hash);
        } catch (RuntimeException) {
            // A hash from another algorithm; it is replaced with a bcrypt one.
            return false;
        }
    }

    /**
     * Save through the model's validation rules and fail loudly, since a
     * ValidatingTrait save() only returns false.
     *
     * @template T of Model
     *
     * @param  T  $model
     * @return T
     */
    private function persist(Model $model, string $what): Model
    {
        if (! $model->isDirty() && $model->exists) {
            return $model;
        }

        if (! $model->save()) {
            $errors = method_exists($model, 'getErrors') ? implode(' ', $model->getErrors()->all()) : '';

            throw new RuntimeException("E2eSeeder: could not save {$what}. {$errors}");
        }

        $this->command?->info("E2eSeeder: saved {$what}");

        return $model;
    }
}
