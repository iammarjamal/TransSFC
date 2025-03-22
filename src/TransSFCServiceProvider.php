<?php

namespace TransSFC\TransSFC;

use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\Lang;
use Illuminate\Support\Facades\View;
use Illuminate\Support\Facades\File;

use Spatie\LaravelPackageTools\Package;
use Spatie\LaravelPackageTools\PackageServiceProvider;

use TransSFC\TransSFC\Commands\TransSFCBuild;
use TransSFC\TransSFC\Commands\TransSFCServe;

class TransSFCServiceProvider extends PackageServiceProvider
{
    public function configurePackage(Package $package): void
    {
        $package
            ->name('TransSFC')
            ->hasCommands([
                TransSFCServe::class
            ]);
    }

    public function boot()
    {
        // Helpers
        require_once __DIR__ . '/Helpers/TransSFCHelper.php';

        // Define the `@TransSFC` directive in Blade
        Blade::directive('TransSFC', function ($expression) {
            // Start a PHP block and assign the variable $TransSFC (this should be properly initialized)
            return "<?php \$TransSFC = ";
        });

        // Define the `@endTransSFC` directive in Blade
        Blade::directive('endTransSFC', function () {
            // Close the PHP block properly
            return "; ?>";
        });
    }
}