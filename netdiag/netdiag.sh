#!/usr/bin/env bash
# netdiag.sh - read-only Wi-Fi / home-network baseline (macOS primary, Linux supported).
# Runs every check SEQUENTIALLY so idle latency is never measured under load.
#
# Usage:   bash netdiag.sh before      (then, after router changes)   bash netdiag.sh after
# Optional: run `sudo -v` first to also capture `wdutil info` (channel utilisation / CCA) on macOS.
# Output:  ~/netdiag-<label>-<timestamp>.txt   (paste or attach it back)
#
# Nothing here changes any setting. Takes roughly 2-4 minutes.

LABEL="${1:-run}"
TS=$(date +%Y%m%d-%H%M%S)
OUT="$HOME/netdiag-$LABEL-$TS.txt"
OS=$(uname -s)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
exec > >(tee "$OUT") 2>&1

hdr()  { printf '\n===== %s =====\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
rand() { LC_ALL=C tr -dc 'a-z0-9' </dev/urandom 2>/dev/null | head -c 12; }

echo "netdiag label=$LABEL  time=$(date)  os=$OS $(uname -r)"

# ---------- interface / gateway ----------
if [ "$OS" = Darwin ]; then
  WIFI_IF=$(networksetup -listallhardwareports | awk '/Wi-Fi|AirPort/{getline; print $2; exit}')
  GW=$(route -n get default 2>/dev/null | awk '/gateway:/{print $2}')
  DEF_IF=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
else
  WIFI_IF=$(iw dev 2>/dev/null | awk '/Interface/{print $2; exit}')
  GW=$(ip route show default 2>/dev/null | awk '{print $3; exit}')
  DEF_IF=$(ip route show default 2>/dev/null | awk '{for(i=1;i<NF;i++) if($i=="dev"){print $(i+1); exit}}')
fi
echo "wifi_if=${WIFI_IF:-none}  default_route_if=${DEF_IF:-?}  gateway=${GW:-?}"
[ -n "$DEF_IF" ] && [ "$DEF_IF" != "$WIFI_IF" ] && echo "NOTE: default route is NOT via Wi-Fi ($DEF_IF) - VPN or Ethernet in use."

# ======================================================================
hdr "1a. Wi-Fi link"
if [ "$OS" = Darwin ]; then
  SP=$(system_profiler SPAirPortDataType 2>/dev/null)
  echo "$SP" | grep -E 'Card Type|Firmware Version|Supported PHY Modes|Country Code' | sed 's/^ *//' | sort -u
  echo "--- current network ---"
  echo "$SP" | awk '/Current Network Information:/{f=1;next} /Other Local Wi-Fi Networks:/{f=0} f' \
    | grep -E 'PHY Mode|Channel|Signal / Noise|Transmit Rate|MCS Index|Security' | sed 's/^ *//'
  if sudo -n true 2>/dev/null; then
    echo "--- wdutil info (WIFI section) ---"
    sudo wdutil info 2>/dev/null | awk '/^WIFI/{f=1} /^BLUETOOTH/{f=0} f' \
      | grep -E 'RSSI|Noise|Tx Rate|PHY Mode|MCS|NSS|Channel|CCA|Guard|Band|Security|Country'
  else
    echo "(wdutil skipped: run 'sudo -v' before the script to include channel utilisation/CCA)"
  fi
  echo "--- interface counters (Ierrs/Oerrs/Colls) ---"
  netstat -I "$WIFI_IF" | head -2
else
  if [ -n "$WIFI_IF" ]; then
    iw dev "$WIFI_IF" info 2>/dev/null | grep -E 'ssid|channel|txpower'
    iw dev "$WIFI_IF" link 2>/dev/null | grep -E 'freq|signal|tx bitrate|rx bitrate'
    iw dev "$WIFI_IF" station dump 2>/dev/null | grep -E 'tx retries|tx failed|beacon loss|expected throughput'
    echo "--- /proc/net/wireless (noise if driver reports it) ---"; cat /proc/net/wireless 2>/dev/null | tail -n +3
    echo "--- interface errors ---"; ip -s link show "$WIFI_IF" 2>/dev/null | sed -n '3,6p'
  else
    echo "No Wi-Fi interface found (wired?)"
  fi
fi

# ======================================================================
hdr "1b. Nearby networks / RF congestion"
# Normalised records: band channel width rssi_dBm
if [ "$OS" = Darwin ]; then
  echo "$SP" | awk '
    /Other Local Wi-Fi Networks:/{f=1;next}
    !f{next}
    /Channel:/{ if(ch!="") print band,ch,w,r; ch=$2; band=$3; w=$4; gsub(/[(,]/,"",band); gsub(/[),]/,"",w); r="na"; next }
    /Signal \/ Noise:/{ r=$4 }
    END{ if(ch!="") print band,ch,w,r }' > "$TMP/scan"
elif have nmcli; then
  nmcli -t -f CHAN,FREQ,SIGNAL dev wifi list --rescan yes 2>/dev/null | awk -F: '{
    f=$2+0; b=(f<3000)?"2GHz":(f<5925)?"5GHz":"6GHz"; print b,$1,"na",int($3/2-100) }' > "$TMP/scan"
else
  : > "$TMP/scan"; echo "(no nmcli: install NetworkManager or run 'sudo iw dev $WIFI_IF scan' manually)"
fi
echo "APs seen: $(wc -l < "$TMP/scan" | tr -d ' ')   (includes your own router's other bands / mesh nodes)"
echo "--- count per channel (band channel count strongest_dBm) ---"
awk '{k=$1" "$2; n[k]++; r=($4=="na")?-100:$4+0; if(!(k in b)||r>b[k]) b[k]=r}
     END{for(k in n) print k, n[k], b[k]}' "$TMP/scan" | sort -k1,1 -k2,2n
awk '
  function blk(c){ if(c>=36&&c<=48)return "36-48(UNII-1)"; if(c>=52&&c<=64)return "52-64(DFS)";
    if(c>=100&&c<=112)return "100-112(DFS)"; if(c>=116&&c<=128)return "116-128(DFS)";
    if(c>=132&&c<=144)return "132-144(DFS)"; if(c>=149&&c<=161)return "149-161(UNII-3)"; return "165+" }
  { c=$2+0; r=($4=="na")?-100:$4+0
    if($1=="2GHz") for(p=1;p<=11;p+=5) if(c>=p-4&&c<=p+4){o[p]++; if(r>-70)s[p]++}
    if($1=="5GHz"){ k=blk(c); f[k]++; if(r>-70)fs[k]++ }
    if($1=="6GHz") six++ }
  END{
    print "--- 2.4 GHz overlap on 1/6/11 (APs within +/-4 ch | strong >-70 dBm | score=3*strong+total) ---"
    best=""; bs=1e9
    for(p=1;p<=11;p+=5){ sc=3*s[p]+o[p]; printf "  ch %-2d total=%d strong=%d score=%d\n",p,o[p],s[p],sc; if(sc<bs){bs=sc;best=p} }
    print "  => cleanest 2.4 GHz: ch " best
    print "--- 5 GHz per 80 MHz block (total | strong) ---"
    split("36-48(UNII-1) 52-64(DFS) 100-112(DFS) 116-128(DFS) 132-144(DFS) 149-161(UNII-3) 165+",L," ")
    best=""; bs=1e9
    for(i=1;i<=7;i++){ k=L[i]; sc=3*fs[k]+f[k]; printf "  %-16s total=%d strong=%d score=%d\n",k,f[k]+0,fs[k]+0,sc; if(sc<bs && k!="165+"){bs=sc;best=k} }
    print "  => cleanest 5 GHz 80 MHz block: " best
    print "--- 6 GHz APs seen: " six+0 " ---" }' "$TMP/scan"

# ======================================================================
hdr "2a. Idle latency (sequential, nothing else running)"
echo "--- gateway $GW (30 pkts) ---"
ping -c 30 -i 0.5 "$GW" > "$TMP/p_gw" 2>&1; tail -3 "$TMP/p_gw"
echo "--- 1.1.1.1 (30 pkts) ---"
ping -c 30 -i 0.5 1.1.1.1 > "$TMP/p_v4" 2>&1; tail -3 "$TMP/p_v4"
HAS_V6=0
if [ "$OS" = Darwin ]; then route -n get -inet6 default >/dev/null 2>&1 && HAS_V6=1
else ip -6 route show default 2>/dev/null | grep -q . && HAS_V6=1; fi
if [ $HAS_V6 = 1 ]; then
  echo "--- 2606:4700:4700::1111 (30 pkts) ---"
  if [ "$OS" = Darwin ]; then ping6 -c 30 -i 0.5 2606:4700:4700::1111 > "$TMP/p_v6" 2>&1
  else ping -6 -c 30 -i 0.5 2606:4700:4700::1111 > "$TMP/p_v6" 2>&1; fi
  tail -3 "$TMP/p_v6"
else echo "IPv6: no default route (inactive)"; fi

hdr "2b. Traceroute (5 hops)"
if have traceroute; then traceroute -n -m 5 -q 3 -w 2 1.1.1.1 2>&1
elif have tracepath; then tracepath -n -m 5 1.1.1.1 2>&1
else echo "(no traceroute/tracepath installed)"; fi

hdr "2c. Background traffic, VPN, proxy"
if [ "$OS" = Darwin ]; then
  rd() { netstat -ib -I "$WIFI_IF" | awk 'NR==2{print $7, $10}'; }
else
  rd() { awk -v i="$WIFI_IF:" '$1==i{print $2, $10}' /proc/net/dev; }
fi
read -r i1 o1 <<<"$(rd)"; sleep 5; read -r i2 o2 <<<"$(rd)"
awk -v a="$i1" -v b="$i2" -v c="$o1" -v d="$o2" 'BEGIN{printf "Background on %s over 5 s: down %.2f Mbps, up %.2f Mbps\n", "wifi", (b-a)*8/5e6, (d-c)*8/5e6}'
if [ "$OS" = Darwin ]; then
  echo "--- top talkers (3 s delta) ---"
  nettop -P -L 2 -s 3 -d -x -J bytes_in,bytes_out 2>/dev/null | awk -F, '/^time/{s++;next} s>=2' | sort -t, -k3,3nr | head -8
  echo "--- VPN services connected ---"; scutil --nc list 2>/dev/null | grep -i 'connected' || echo none
  echo "--- utun default routes ---"; netstat -rn -f inet | awk '$1=="default"'
  echo "--- proxies ---"; scutil --proxy | grep -E 'Enable : 1|Proxy :|AutoConfigURL' || echo none
  echo "--- Wi-Fi disconnect/roam events, last 12 h (can take ~30 s) ---"
  log show --last 12h --style compact \
    --predicate '(process == "airportd" OR senderImagePath CONTAINS "IO80211") AND (eventMessage CONTAINS[c] "disassoc" OR eventMessage CONTAINS[c] "deauth" OR eventMessage CONTAINS[c] "roam" OR eventMessage CONTAINS[c] "link down" OR eventMessage CONTAINS[c] "beacon lost")' \
    2>/dev/null > "$TMP/ev"
  echo "matching events: $(grep -vc '^Timestamp' "$TMP/ev")"; tail -12 "$TMP/ev" | cut -c1-200
else
  echo "--- tunnels ---"; ip -br link 2>/dev/null | grep -Ei 'tun|wg|tailscale|ppp' || echo none
  echo "--- proxy env ---"; env | grep -i '_proxy=' || echo none
  echo "--- Wi-Fi events, last 12 h ---"
  journalctl --since "-12h" -u NetworkManager -u wpa_supplicant -u iwd 2>/dev/null \
    | grep -Ei 'disconnect|deauth|roam|beacon loss|CTRL-EVENT' > "$TMP/ev"
  echo "matching events: $(wc -l < "$TMP/ev" | tr -d ' ')"; tail -12 "$TMP/ev" | cut -c1-200
fi

# ======================================================================
hdr "3. DNS"
if [ "$OS" = Darwin ]; then CUR_DNS=$(scutil --dns | awk '/nameserver\[/{print $3}' | awk '!s[$0]++')
elif have resolvectl; then CUR_DNS=$(resolvectl dns 2>/dev/null | grep -Eo '([0-9]{1,3}\.){3}[0-9]{1,3}|[0-9a-f:]+:[0-9a-f:]+' | awk '!s[$0]++')
else CUR_DNS=$(awk '/^nameserver/{print $2}' /etc/resolv.conf); fi
echo "current DNS: $(echo $CUR_DNS)"
if have dig; then
  printf '%-28s %10s %12s\n' server cached_ms uncached_ms
  for S in $(printf '%s\n' $CUR_DNS 1.1.1.1 8.8.8.8 "$GW" | awk 'NF && !s[$0]++'); do
    dig +tries=1 +time=2 @"$S" www.google.com A >/dev/null 2>&1          # warm
    c=$(for i in 1 2 3 4 5; do dig +tries=1 +time=2 @"$S" www.google.com A 2>/dev/null | awk '/Query time/{print $4}'; done | sort -n | awk '{a[NR]=$1}END{print (NR?a[int((NR+1)/2)]:"timeout")}')
    u=$(for d in google.com amazon.com microsoft.com wikipedia.org youtube.com; do dig +tries=1 +time=3 @"$S" "$(rand).$d" A 2>/dev/null | awk '/Query time/{print $4}'; done | sort -n | awk '{a[NR]=$1}END{print (NR?a[int((NR+1)/2)]:"timeout")}')
    printf '%-28s %10s %12s\n' "$S" "$c" "$u"
    echo "DNS $S cached=$c uncached=$u" >> "$TMP/dns"
  done
  echo "(median of 5; 'uncached' = random never-seen names, forcing a recursive lookup)"
else
  echo "(dig not installed - Linux: install dnsutils/bind-utils)"
fi

# ======================================================================
hdr "4. Throughput & bufferbloat under load"
sysctl -a 2>/dev/null | grep -Ei '\.ecn|l4s' | head -8
if [ "$OS" = Darwin ] && have networkQuality; then
  networkQuality -v 2>&1 | tee "$TMP/nq"
else
  echo "networkQuality not available - using Cloudflare download/upload with concurrent ping"
  ping -c 24 -i 0.5 1.1.1.1 > "$TMP/p_dl" 2>&1 & PP=$!
  P=(); for i in 1 2 3 4; do curl -s -o /dev/null -w '%{speed_download}\n' --max-time 12 'https://speed.cloudflare.com/__down?bytes=1000000000' >> "$TMP/dl" & P+=($!); done
  wait "$PP" "${P[@]}"
  ping -c 24 -i 0.5 1.1.1.1 > "$TMP/p_ul" 2>&1 & PP=$!
  P=(); for i in 1 2 3 4; do head -c 300000000 /dev/zero | curl -s -o /dev/null -w '%{speed_upload}\n' --max-time 12 -X POST --data-binary @- https://speed.cloudflare.com/__up >> "$TMP/ul" & P+=($!); done
  wait "$PP" "${P[@]}"
  awk '{s+=$1}END{printf "Downlink capacity: %.1f Mbps\n", s*8/1e6}' "$TMP/dl" | tee "$TMP/nq"
  awk '{s+=$1}END{printf "Uplink capacity: %.1f Mbps\n", s*8/1e6}' "$TMP/ul" | tee -a "$TMP/nq"
  echo "latency during download: $(tail -1 "$TMP/p_dl")" | tee -a "$TMP/nq"
  echo "latency during upload:   $(tail -1 "$TMP/p_ul")" | tee -a "$TMP/nq"
fi

# ======================================================================
pst() { [ -f "$1" ] || { echo n/a; return; }
  l=$(grep -Eo '[0-9.]+% packet loss' "$1" | awk '{print $1}')
  r=$(grep -E 'min/avg/max' "$1" | awk -F'= ' '{print $2}' | awk '{print $1}')
  echo "loss=${l:-?} min/avg/max/jitter(sd)=${r:-?} ms"; }
hdr "SUMMARY ($LABEL)"
if [ "$OS" = Darwin ]; then
  echo "$SP" | awk '/Current Network Information:/{f=1;next} /Other Local Wi-Fi Networks:/{f=0} f' \
    | grep -E 'PHY Mode|Channel|Signal / Noise|Transmit Rate|MCS Index' | sed 's/^ */wifi /'
fi
echo "ping gateway : $(pst "$TMP/p_gw")"
echo "ping 1.1.1.1 : $(pst "$TMP/p_v4")"
[ -f "$TMP/p_v6" ] && echo "ping v6 CF   : $(pst "$TMP/p_v6")"
[ -f "$TMP/dns" ] && cat "$TMP/dns"
grep -Ei 'capacity|responsiveness|idle latency|latency during|ecn|l4s' "$TMP/nq" 2>/dev/null
echo
echo "Saved to: $OUT"
sleep 1
