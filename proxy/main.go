package main

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
)

var stripHeaders = []string{
	"X-Proxy-Secret",
	"X-Client-Info",
	"X-Supabase-Api-Version",
	"Apikey",
	"X-Forwarded-For",
	"X-Forwarded-Host",
	"X-Forwarded-Proto",
	"X-Real-Ip",
	"Cf-Connecting-Ip",
	"Cf-Ray",
	"Cf-Visitor",
	"Cf-Ipcountry",
}

func main() {
	secret := os.Getenv("PROXY_SECRET")
	target, _ := url.Parse("https://fapi.binance.com")

	proxy := &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(target)
			r.Out.Host = target.Host
			for _, h := range stripHeaders {
				r.Out.Header.Del(h)
			}
			if r.Out.Header.Get("User-Agent") == "" {
				r.Out.Header.Set("User-Agent", "python-requests/2.31.0")
			}
		},
		ModifyResponse: func(resp *http.Response) error {
			resp.Header.Del("Access-Control-Allow-Origin")
			return nil
		},
	}

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if secret != "" && r.Header.Get("X-Proxy-Secret") != secret {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		proxy.ServeHTTP(w, r)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	http.ListenAndServe(":"+port, nil)
}