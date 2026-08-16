import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, CheckCircle, ClockCountdown, CurrencyDollar,
  Headset, MagnifyingGlass, Minus, Package, Plus, ShieldCheck, ShoppingCart, Storefront, Trash, Truck,
} from "@phosphor-icons/react";
import { formatMoney } from "../data.jsx";

const StoreContext = createContext(null);

function getStoredCart() {
  try { return JSON.parse(localStorage.getItem("tex-store-cart") || "{}"); }
  catch { return {}; }
}

function stockLabel(product) {
  if (product.totalStock === 0) return { label:"Out of stock", tone:"out" };
  if (product.totalStock <= 10) return { label:`Only ${product.totalStock} left`, tone:"low" };
  return { label:"In stock", tone:"in" };
}

function StoreProvider({ children }) {
  const [catalogue,setCatalogue] = useState(null);
  const [cart,setCart] = useState(getStoredCart);
  const [cartNotice,setCartNotice] = useState(null);
  const [style,setStyle] = useState(()=>Number(localStorage.getItem("tex-style"))||1);
  const [error,setError] = useState("");

  useEffect(() => {
    fetch("/api/storefront").then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load the catalogue");
      setCatalogue(payload);
    }).catch(nextError => setError(nextError.message));
  },[]);

  useEffect(() => { localStorage.setItem("tex-store-cart",JSON.stringify(cart)); },[cart]);

  useEffect(() => {
    if (!cartNotice) return undefined;
    const dismissTimer = window.setTimeout(() => setCartNotice(null),3500);
    return () => window.clearTimeout(dismissTimer);
  },[cartNotice]);

  const updateQuantity = (productId,quantity) => {
    setCart(current => {
      if (quantity <= 0) {
        const next = { ...current };
        delete next[productId];
        return next;
      }
      return { ...current,[productId]:quantity };
    });
  };

  const addToCart = (product,quantity = 1) => {
    if (!product || quantity < 1) throw new Error("A product and positive quantity are required");
    const safeQuantity = Math.min(quantity,product.totalStock);
    setCart(current => ({
      ...current,
      [product.id]:Math.min((current[product.id] || 0) + safeQuantity,product.totalStock),
    }));
    setCartNotice({ productId:product.id,name:product.name,image:product.image,quantity:safeQuantity,createdAt:Date.now() });
  };

  const cartLines = useMemo(() => {
    if (!catalogue) return [];
    return Object.entries(cart).flatMap(([productId,quantity]) => {
      const product = catalogue.products.find(item => item.id === productId);
      if (!product) return [];
      return [{ product,quantity,unitPrice:quantityPrice(product,quantity) }];
    });
  },[catalogue,cart]);

  const selectStyle = nextStyle => {
    if (![1,2,3].includes(nextStyle)) throw new Error("Store style must be 1, 2, or 3");
    setStyle(nextStyle);
    localStorage.setItem("tex-style",String(nextStyle));
  };

  const value = { catalogue,setCatalogue,cart,cartLines,updateQuantity,addToCart,cartNotice,error,setError,style,selectStyle };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used within StoreProvider");
  return context;
}

function quantityPrice(product,quantity) {
  const tiers = [...(product.priceTiers || [])].sort((a,b) => b.minQty-a.minQty);
  return tiers.find(tier => quantity >= tier.minQty)?.price ?? product.retailPrice;
}

async function fetchTrackedOrder(reference,phone) {
  const normalizedReference = reference.trim().toUpperCase();
  const normalizedPhone = phone.trim();
  if (!normalizedReference || !normalizedPhone) throw new Error("Enter the order reference and phone number");
  const query = new URLSearchParams({ reference:normalizedReference,phone:normalizedPhone });
  const response = await fetch(`/api/web-orders/track?${query}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Order could not be found");
  return payload;
}

function StoreHeader() {
  const { cartLines,style,selectStyle } = useStore();
  const itemCount = cartLines.reduce((sum,line) => sum + line.quantity,0);
  return <header className="store-header">
    <Link className="store-logo" to="/store"><span><Storefront weight="duotone"/></span><strong>Tex Electronic<small>Components that keep ideas moving</small></strong></Link>
    <nav><Link to="/store">Products</Link><Link to="/store/track">Track order</Link><a href="#support">Help & contact</a></nav>
    <div className="store-style-switch" aria-label="Store style"><span>Style</span>{[1,2,3].map(value=><button className={style===value?"active":""} aria-label={`Choose style ${value}`} aria-pressed={style===value} onClick={()=>selectStyle(value)} key={value}>{value}</button>)}</div>
    <Link className="store-cart-link" to="/store/cart"><ShoppingCart weight="bold"/><span>Cart</span>{itemCount>0&&<b>{itemCount}</b>}</Link>
  </header>;
}

function StoreCartNotice() {
  const { cartNotice } = useStore();
  if (!cartNotice) return null;
  return <aside className="store-cart-notice" role="status" aria-live="polite" key={cartNotice.createdAt}>
    <img src={cartNotice.image} alt=""/>
    <span><strong>Added to cart</strong><small>{cartNotice.quantity > 1 ? `${cartNotice.quantity} × ` : ""}{cartNotice.name}</small></span>
    <Link to="/store/cart">View cart <ArrowRight/></Link>
  </aside>;
}

function StoreLayout({ children }) {
  const { catalogue,error,style } = useStore();
  if (error) return <div className={`storefront store-style-${style}`}><StoreHeader/><div className="store-load-error"><Package/><h1>Catalogue unavailable</h1><p>{error}</p></div></div>;
  if (!catalogue) return <div className={`storefront store-style-${style}`}><StoreHeader/><div className="store-loading">Loading online catalogue…</div></div>;
  return <div className={`storefront store-style-${style}`}><StoreHeader/>{children}<StoreCartNotice/><footer className="store-footer" id="support"><div><strong>Tex Electronic</strong><span>Electronics components, tools and boards.</span></div><div><strong>Need help choosing a part?</strong><span>Call or message our team before ordering.</span></div><div className="store-footer-links"><Link to="/dashboard">Staff & admin sign in <ArrowRight/></Link></div></footer></div>;
}

function CataloguePage() {
  const { catalogue,addToCart,cartNotice } = useStore();
  const [query,setQuery] = useState("");
  const [category,setCategory] = useState("All");
  if (!catalogue) return <StoreLayout/>;
  const categories = ["All",...new Set(catalogue.products.map(product => product.category))];
  const normalizedQuery = query.trim().toLowerCase();
  const visibleProducts = catalogue.products.filter(product => {
    if (category !== "All" && product.category !== category) return false;
    if (!normalizedQuery) return true;
    return [product.name,product.sku,product.partNumber,product.category,product.manufacturer,...product.aliases].join(" ").toLowerCase().includes(normalizedQuery);
  });

  return <StoreLayout><main className="store-main">
    <section className="store-hero"><div><span className="store-kicker">Phnom Penh electronics supply</span><h1>Find the right component.<br/>Know it’s available.</h1><p>Browse live availability, compare specifications and order for pickup or delivery.</p><div className="store-hero-actions"><a href="#catalogue">Browse components <ArrowRight/></a><Link to="/store/track">Track an order</Link></div></div><div className="store-hero-stat"><ShieldCheck weight="duotone"/><strong>Live shop inventory</strong><span>Availability updates when orders are confirmed.</span></div></section>
    <section className="store-trust-strip" aria-label="Why order from Tex Electronic"><div><ShieldCheck/><span><strong>Live availability</strong><small>Shared with our shop floor</small></span></div><div><CurrencyDollar/><span><strong>Volume pricing</strong><small>Automatic quantity breaks</small></span></div><div><Headset/><span><strong>Local confirmation</strong><small>Our team checks every order</small></span></div><div><Truck/><span><strong>Pickup or delivery</strong><small>Choose at checkout</small></span></div></section>
    <div className="store-search"><MagnifyingGlass/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search part number, value, category or brand…"/><span>{visibleProducts.length} products</span></div>
    <div className="store-categories">{categories.map(item=><button className={category===item?"active":""} aria-pressed={category===item} onClick={()=>setCategory(item)} key={item}>{item}</button>)}</div>
    <section className="store-grid" id="catalogue">{visibleProducts.map(product => {
      const availability = stockLabel(product);
      const wasJustAdded = cartNotice?.productId === product.id;
      return <article className="store-product-card" key={product.id}><Link className="store-card-image" to={`/store/products/${product.id}`}><img src={product.image} alt={product.name}/></Link><div className="store-card-body"><span className={`store-stock ${availability.tone}`}><i/>{availability.label}</span><Link to={`/store/products/${product.id}`}><h2>{product.name}</h2></Link><code>{product.sku} · {product.manufacturer}</code><p>{product.description}</p><div className="store-card-price"><span>From <strong>{formatMoney(product.retailPrice)}</strong><small>per piece</small></span><button className={wasJustAdded?"is-added":""} aria-label={`Add ${product.name} to cart`} disabled={product.totalStock===0} onClick={()=>addToCart(product,1)}>{wasJustAdded?<CheckCircle weight="fill"/>:<Plus/>} {wasJustAdded?"Added":"Add"}</button></div></div></article>;
    })}</section>
    {visibleProducts.length===0&&<div className="store-empty"><MagnifyingGlass/><h2>No products found</h2><p>Try another part number, value or category.</p></div>}
  </main></StoreLayout>;
}

function StoreProductPage() {
  const { id } = useParams();
  const { catalogue,cart,addToCart,cartNotice } = useStore();
  const [quantity,setQuantity] = useState(()=>cart[id] || 1);
  if (!catalogue) return <StoreLayout/>;
  const product = catalogue.products.find(item => item.id === id);
  if (!product) return <Navigate to="/store" replace/>;
  const availability = stockLabel(product);
  const unitPrice = quantityPrice(product,quantity);
  return <StoreLayout><main className="store-main"><Link className="store-back" to="/store"><ArrowLeft/> Back to products</Link><section className="store-product-detail">
    <div className="store-detail-image"><img src={product.image} alt={product.name}/><span>Product image for reference</span></div>
    <div className="store-detail-info"><span className="store-kicker">{product.category} · {product.manufacturer}</span><h1>{product.name}</h1><code>{product.sku} · Part {product.partNumber}</code><p className="store-detail-description">{product.description}</p><span className={`store-stock large ${availability.tone}`}><i/>{availability.label}</span>
      <div className="store-buy-box"><div><small>Unit price</small><strong>{formatMoney(unitPrice)}</strong>{unitPrice!==product.retailPrice&&<span>Quantity price applied</span>}</div><div className="store-quantity"><button aria-label="Decrease quantity" disabled={quantity<=1} onClick={()=>setQuantity(value=>Math.max(1,value-1))}><Minus/></button><input aria-label="Quantity" type="number" min="1" max={product.totalStock} value={quantity} onChange={event=>setQuantity(Math.max(1,Number(event.target.value)||1))}/><button aria-label="Increase quantity" disabled={quantity>=product.totalStock} onClick={()=>setQuantity(value=>Math.min(product.totalStock,value+1))}><Plus/></button></div><button className={`store-primary ${cartNotice?.productId===product.id?"is-added":""}`} disabled={product.totalStock===0||quantity>product.totalStock} onClick={()=>addToCart(product,quantity)}>{cartNotice?.productId===product.id?<CheckCircle weight="fill"/>:<ShoppingCart/>} {cartNotice?.productId===product.id?"Added to cart":"Add to cart"}</button></div>
      {product.priceTiers.length>0&&<div className="store-tier-row"><span>Quantity pricing</span>{[...product.priceTiers].sort((a,b)=>a.minQty-b.minQty).map(tier=><b key={tier.minQty}>{tier.minQty}+ <strong>{formatMoney(tier.price)}</strong></b>)}</div>}
    </div>
  </section><section className="store-specs"><div><span className="store-kicker">Technical details</span><h2>Specifications</h2></div><dl>{Object.entries(product.specs).map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl></section></main></StoreLayout>;
}

const trackingSteps = ["NEW","CONFIRMED","READY","COMPLETED"];

function TrackOrderPage() {
  const [searchParams] = useSearchParams();
  const [reference,setReference] = useState(searchParams.get("reference") || "");
  const [phone,setPhone] = useState(searchParams.get("phone") || "");
  const [order,setOrder] = useState(null);
  const [trackError,setTrackError] = useState("");
  const [loading,setLoading] = useState(false);

  useEffect(() => {
    const presetReference = searchParams.get("reference") || "";
    const presetPhone = searchParams.get("phone") || "";
    if (!presetReference || !presetPhone) return undefined;
    let isActive = true;
    setLoading(true);
    fetchTrackedOrder(presetReference,presetPhone)
      .then(payload => { if (isActive) setOrder(payload); })
      .catch(nextError => { if (isActive) setTrackError(nextError.message); })
      .finally(() => { if (isActive) setLoading(false); });
    return () => { isActive = false; };
  },[searchParams]);

  const track = async event => {
    event.preventDefault();
    setLoading(true); setTrackError(""); setOrder(null);
    try {
      setOrder(await fetchTrackedOrder(reference,phone));
    } catch (nextError) { setTrackError(nextError.message); }
    finally { setLoading(false); }
  };

  const activeStep = order?.status === "CANCELLED" ? -1 : trackingSteps.indexOf(order?.status);
  return <StoreLayout><main className="store-main"><section className="track-order-hero"><span className="store-kicker">Order visibility</span><h1>Track your order</h1><p>Use the order reference from your confirmation and the same phone number used at checkout.</p></section><div className="track-order-layout"><form className="track-order-form" onSubmit={track}><label>Order reference<input required value={reference} onChange={event=>setReference(event.target.value.toUpperCase())} placeholder="WEB-XXXXXXXX"/></label><label>Phone number<input required minLength="8" value={phone} onChange={event=>setPhone(event.target.value)} placeholder="012 345 678"/></label>{trackError&&<div className="store-form-error" role="alert">{trackError}</div>}<button className="store-primary" disabled={loading}>{loading?"Checking…":"Track order"}<MagnifyingGlass/></button><small>For your privacy, both details must match the order.</small></form><section className="track-order-result">{order?<><div className="track-order-head"><div><span className="store-kicker">{order.reference}</span><h2>{order.status === "CANCELLED" ? "Order cancelled" : order.status === "COMPLETED" ? "Order completed" : "Order in progress"}</h2><p>{order.fulfillmentMethod === "PICKUP" ? "Shop pickup" : "Delivery"} · placed {new Date(order.createdAt).toLocaleDateString()}</p></div><strong>{formatMoney(order.subtotal)}</strong></div>{order.status === "CANCELLED"?<div className="track-cancelled"><ClockCountdown/><strong>This order was cancelled</strong><span>Reserved stock has been released. Contact our team if you need help reordering.</span></div>:<div className="tracking-steps">{trackingSteps.map((step,index)=><div className={index<=activeStep?"complete":""} key={step}><i>{index<activeStep?<CheckCircle weight="fill"/>:index+1}</i><span><strong>{step==="NEW"?"Received":step.charAt(0)+step.slice(1).toLowerCase()}</strong><small>{step==="NEW"?"Stock reserved":step==="CONFIRMED"?"Checked by our team":step==="READY"?"Ready for pickup or dispatch":"Order fulfilled"}</small></span></div>)}</div>}<div className="tracked-items">{order.items.map(item=><div key={item.sku}><span><strong>{item.product_name}</strong><small>{item.sku} · {item.quantity} pcs</small></span><b>{formatMoney(item.line_total)}</b></div>)}</div></>:<div className="track-placeholder"><ClockCountdown weight="duotone"/><h2>Clear order updates</h2><p>See when your order is confirmed, ready, completed, or cancelled—without calling the shop.</p></div>}</section></div></main></StoreLayout>;
}

function CartPage() {
  const { cartLines,updateQuantity,setCatalogue } = useStore();
  const navigate = useNavigate();
  const [submitting,setSubmitting] = useState(false);
  const [submitError,setSubmitError] = useState("");
  const [confirmation,setConfirmation] = useState(null);
  const [form,setForm] = useState({ customerName:"",phone:"",fulfillmentMethod:"PICKUP",address:"",note:"" });
  const subtotal = cartLines.reduce((sum,line)=>sum+line.unitPrice*line.quantity,0);

  const submit = async event => {
    event.preventDefault();
    if (cartLines.length===0) return;
    setSubmitting(true); setSubmitError("");
    try {
      const response = await fetch("/api/web-orders",{ method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ ...form,items:cartLines.map(line=>({productId:line.product.id,quantity:line.quantity})) }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Order could not be submitted");
      setCatalogue(payload.storefront);
      for (const line of cartLines) updateQuantity(line.product.id,0);
      setConfirmation(payload);
    } catch (nextError) { setSubmitError(nextError.message); }
    finally { setSubmitting(false); }
  };

  if (confirmation) return <StoreLayout><main className="store-main"><section className="store-order-success"><CheckCircle weight="duotone"/><span className="store-kicker">Order received</span><h1>Thank you, {form.customerName}.</h1><p>Your order <strong>{confirmation.reference}</strong> is reserved. Our team will contact you at <strong>{form.phone}</strong> to confirm {form.fulfillmentMethod==="PICKUP"?"pickup":"delivery"} and payment.</p><div><span>Order total</span><strong>{formatMoney(confirmation.subtotal)}</strong></div><span className="order-success-actions"><Link className="store-primary" to={`/store/track?reference=${encodeURIComponent(confirmation.reference)}&phone=${encodeURIComponent(form.phone)}`}>Track this order</Link><button onClick={()=>navigate("/store")}>Continue shopping</button></span></section></main></StoreLayout>;

  return <StoreLayout><main className="store-main"><Link className="store-back" to="/store"><ArrowLeft/> Continue shopping</Link><div className="store-cart-page"><section><span className="store-kicker">Your selection</span><h1>Shopping cart</h1>{cartLines.length===0?<div className="store-empty cart"><ShoppingCart/><h2>Your cart is empty</h2><p>Add products from the online catalogue.</p><Link className="store-primary" to="/store">Browse products</Link></div>:<div className="store-cart-lines">{cartLines.map(line=><article key={line.product.id}><img src={line.product.image} alt=""/><div><strong>{line.product.name}</strong><code>{line.product.sku}</code><button aria-label={`Remove ${line.product.name} from cart`} onClick={()=>updateQuantity(line.product.id,0)}><Trash/> Remove</button></div><div className="store-quantity"><button aria-label={`Decrease quantity of ${line.product.name}`} disabled={line.quantity<=1} onClick={()=>updateQuantity(line.product.id,line.quantity-1)}><Minus/></button><input aria-label={`Quantity for ${line.product.name}`} type="number" inputMode="numeric" min="1" max={line.product.totalStock} value={line.quantity} onChange={event=>updateQuantity(line.product.id,Math.max(1,Math.min(line.product.totalStock,Number(event.target.value)||1)))}/><button aria-label={`Increase quantity of ${line.product.name}`} disabled={line.quantity>=line.product.totalStock} onClick={()=>updateQuantity(line.product.id,line.quantity+1)}><Plus/></button></div><b>{formatMoney(line.unitPrice*line.quantity)}<small>{formatMoney(line.unitPrice)} each</small></b></article>)}</div>}</section>
    <form className="store-checkout" onSubmit={submit}><span className="store-kicker">Reserve your order</span><h2>Contact & fulfillment</h2><label>Full name<input required minLength="2" value={form.customerName} onChange={event=>setForm({...form,customerName:event.target.value})} placeholder="Your name"/></label><label>Phone number<input required minLength="8" value={form.phone} onChange={event=>setForm({...form,phone:event.target.value})} placeholder="e.g. 012 345 678"/></label><div className="store-fulfillment"><button type="button" aria-pressed={form.fulfillmentMethod==="PICKUP"} className={form.fulfillmentMethod==="PICKUP"?"active":""} onClick={()=>setForm({...form,fulfillmentMethod:"PICKUP"})}><Storefront/>Shop pickup</button><button type="button" aria-pressed={form.fulfillmentMethod==="DELIVERY"} className={form.fulfillmentMethod==="DELIVERY"?"active":""} onClick={()=>setForm({...form,fulfillmentMethod:"DELIVERY"})}><Truck/>Delivery</button></div>{form.fulfillmentMethod==="DELIVERY"&&<label>Delivery address<textarea required minLength="5" value={form.address} onChange={event=>setForm({...form,address:event.target.value})} placeholder="Street, sangkat, khan…"/></label>}<label>Order note <span>Optional</span><textarea value={form.note} onChange={event=>setForm({...form,note:event.target.value})} placeholder="Any product or delivery notes"/></label>{submitError&&<div className="store-form-error" role="alert">{submitError}</div>}<div className="store-checkout-total"><span>Subtotal</span><strong>{formatMoney(subtotal)}</strong><small>Payment is confirmed by our team after order review.</small></div><button className="store-primary" disabled={submitting||cartLines.length===0}>{submitting?"Submitting…":"Submit order"} <ArrowRight/></button></form></div></main></StoreLayout>;
}

export function StorefrontApp() {
  return <StoreProvider><Routes><Route index element={<CataloguePage/>}/><Route path="products/:id" element={<StoreProductPage/>}/><Route path="cart" element={<CartPage/>}/><Route path="track" element={<TrackOrderPage/>}/><Route path="*" element={<Navigate to="/store" replace/>}/></Routes></StoreProvider>;
}
