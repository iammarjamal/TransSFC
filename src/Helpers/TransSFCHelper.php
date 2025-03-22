<?php

namespace TransSFC\TransSFC\Helpers;

use Illuminate\Support\Facades\Lang;
use Illuminate\Support\Facades\View;

if (!function_exists('transSFC')) { // Function name only
    /**
     * Function to fetch translation based on current view path and locale.
     *
     * @param string $text
     * @param string|null $locale
     * @return string
     */
    function transSFC($text, $locale = null)
    {
        // Get the current view path shared by the View.
        $currentViewPath = View::shared('currentViewPath');

        // If locale is not provided, use the default app locale.
        $locale = $locale ?: app()->getLocale();

        // If there is no current view path, return the original text.
        if (!$currentViewPath) {
            return $text;
        }

        // Build the translation key using the current view path and text
        $translationKey = "{$currentViewPath}.{$text}";

        // Check if the translation exists for the current view and locale.
        return Lang::has($translationKey, $locale)
            ? trans($translationKey, [], $locale)
            : $text;
    }
}