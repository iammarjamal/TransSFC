<?php

namespace TransSFC\TransSFC;

use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Str;
use Spatie\LaravelPackageTools\Package;
use Spatie\LaravelPackageTools\PackageServiceProvider;

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

    public function packageBooted()
    {
        // Define the Blade directive 'useTrans'
        Blade::directive('useTrans', function ($expression) {
            // Get the full path of the view being executed
            $view = Blade::getPath();

            // Extract the part after "views/"
            $view = Str::after($view, resource_path('views') . DIRECTORY_SEPARATOR);

            // Replace / or \ with . and remove the .blade.php extension
            $view = Str::replace(DIRECTORY_SEPARATOR, '.', Str::beforeLast($view, '.blade.php'));

            // Use the passed variable as the key for the text to be translated
            $textKey = trim($expression, "'\"");

            // Build the translation key by combining the path and the text key
            $translationKey = "app.sfc.{$view}.{$textKey}";

            // Return the translation based on the generated key
            return "<?php echo trans('{$translationKey}'); ?>";
        });

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