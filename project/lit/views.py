import json

from django.core.urlresolvers import reverse_lazy
from django.http import HttpResponseRedirect, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.views.generic.edit import FormView

from utils.views import (AssessmentPermissionsMixin, MessageMixin, BaseList,
                         BaseCreate, BaseDetail, BaseUpdate, BaseDelete)
from assessment.models import Assessment

from . import forms
from . import models


class LitOverview(BaseList):
    parent_model = Assessment
    model = models.Search
    template_name = "lit/overview.html"

    def get_queryset(self):
        return self.model.objects.filter(assessment=self.assessment)\
                                 .exclude(slug="manual-import")

    def get_context_data(self, **kwargs):
        context = super(LitOverview, self).get_context_data(**kwargs)
        context['overview'] = models.Reference.get_overview_details(self.assessment)
        context['manual_import'] = models.Search.get_manually_added(self.assessment)
        if context['obj_perms']['edit']: # expensive, only calculate if needed
            qryset = models.Reference.get_references_ready_for_import(self.assessment)
            context['need_import_count'] = qryset.count()
        context['tags'] = models.ReferenceFilterTag.get_all_tags(self.assessment)
        return context


class SearchList(BaseList):
    parent_model = Assessment
    model = models.Search

    def get_queryset(self):
        return self.model.objects.filter(assessment=self.assessment)


class RefDownloadExcel(BaseList):
    parent_model = Assessment
    model = models.Reference

    def get(self, request, *args, **kwargs):
        try:
            tag_pk = int(request.GET.get('tag_pk', None))
            tag = models.ReferenceFilterTag.objects.get(pk=tag_pk)
        except:
            tag = None

        xls = self.model.assessment_excel_export(self.assessment, tag)
        response = HttpResponse(xls, content_type='application/vnd.ms-excel')
        response['Content-Disposition'] = 'attachment; filename="download.xls"'
        return response


class SearchNew(BaseCreate):
    success_message = 'Search created.'
    parent_model = Assessment
    parent_template_name = 'assessment'
    model = models.Search
    form_class = forms.SearchForm

    def get_context_data(self, **kwargs):
        context = super(SearchNew, self).get_context_data(**kwargs)
        context['type'] = 'Search'
        return context


class ImportNew(SearchNew):
    success_message = "Import created."
    form_class = forms.ImportForm

    def get_context_data(self, **kwargs):
        context = super(ImportNew, self).get_context_data(**kwargs)
        context['type'] = 'Import'
        return context

    def post_object_save(self, form):
        self.object.run_new_import()


class SearchDetail(BaseDetail):
    model = models.Search

    def get_object(self, **kwargs):
        obj = get_object_or_404(models.Search,
                                slug=self.kwargs.get(self.slug_url_kwarg),
                                assessment=self.kwargs.get('pk'))
        return super(SearchDetail, self).get_object(object=obj)


class SearchUpdate(BaseUpdate):
    success_message = 'Search updated.'
    model = models.Search
    form_class = forms.SearchForm

    def get_object(self):
        slug = self.kwargs.get(self.slug_url_kwarg, None)
        assessment = self.kwargs.get('pk', None)
        obj = get_object_or_404(models.Search, assessment=assessment, slug=slug)
        return super(SearchUpdate, self).get_object(object=obj)

    def post_object_save(self, form):
        if self.object.source == 2:
            self.object.run_new_query()  # re-import from HERO only


class SearchDelete(BaseDelete):
    success_message = 'Search deleted.'
    model = models.Search

    def get_object(self):
        slug = self.kwargs.get(self.slug_url_kwarg, None)
        self.assessment = get_object_or_404(Assessment, pk=self.kwargs.get('pk'))
        obj = get_object_or_404(models.Search, assessment=self.assessment, slug=slug)
        return super(SearchDelete, self).get_object(object=obj)

    def get_success_url(self):
        return reverse_lazy('lit:search_list', kwargs={'pk': self.assessment.pk})


class SearchDownloadExcel(BaseDetail):
    model = models.Search

    def get_object(self, **kwargs):
        obj = get_object_or_404(models.Search,
                                slug=self.kwargs.get(self.slug_url_kwarg),
                                assessment=self.kwargs.get('pk'))
        return super(SearchDownloadExcel, self).get_object(object=obj)

    def get(self, request, *args, **kwargs):
        self.object = self.get_object()
        xls = self.object.excel_export()
        response = HttpResponse(xls, content_type='application/vnd.ms-excel')
        response['Content-Disposition'] = 'attachment; filename="download.xls"'
        return response


class SearchQuery(BaseUpdate):
    model = models.Search
    form_class = forms.SearchForm
    http_method_names = (u'get', )  # don't allow POST

    def get_object(self, **kwargs):
        obj = get_object_or_404(self.model,
                                slug=self.kwargs.get(self.slug_url_kwarg),
                                assessment=self.kwargs.get('pk'))
        return super(SearchQuery, self).get_object(object=obj)

    def get(self, request, *args, **kwargs):
        self.object = self.get_object()
        try:
            self.object.run_new_query()
        except models.TooManyPubMedResults as e:
            return HttpResponse("""
                                <p>PubMed Search error: <br>{0}</p>
                                <p>Please perform a more targeted-search.</p>
                                """.format(e))
        return HttpResponseRedirect(self.object.get_absolute_url())


class SearchTagsEdit(BaseUpdate):
    """
    Custom view to edit references for a given search. Uses Search as object
    based on URL and also for permissions checking. POST requests send a
    Reference form and user-settings to be returned and altered back to the
    server.

    TODO:
        - batch-send all changes at once, rather than individual changes for each references
        - maybe not fetch all references if there are hundreds?
    """
    model = models.Search
    form_class = forms.SearchForm
    template_name = "lit/search_tags_edit.html"

    def post(self, request, *args, **kwargs):
        if self.request.is_ajax():
            self.object = self.get_object()  # permissions check
            response = self.update_reference_tags()
            return HttpResponse(json.dumps(response), content_type="application/json")
        else:
            raise Http404

    def get_object(self, **kwargs):
        obj = get_object_or_404(self.model,
                                slug=self.kwargs.get(self.slug_url_kwarg),
                                assessment=self.kwargs.get('pk'))
        return super(SearchTagsEdit, self).get_object(object=obj)

    def update_reference_tags(self):
        # find reference, check that the assessment is the same as the one we
        # have permissions-checked for, and if so, update reference-tags
        response = {"status": "fail"}
        pk = self.request.POST.get('pk', -1)
        ref = models.Reference.objects.filter(pk=pk).first()
        if (ref) and (ref.assessment_id == self.assessment.id):
            tag_pks = self.request.POST.getlist('tags[]', [])
            ref.tags.set(tag_pks)
            response["status"] = "success"
        return response

    def get_context_data(self, **kwargs):
        context = super(SearchTagsEdit, self).get_context_data(**kwargs)
        context['references'] = models.Reference.objects.filter(searches=self.object) \
                                                .prefetch_related('identifiers')
        context['tags'] = models.ReferenceFilterTag.get_all_tags(self.assessment)
        return context


class SearchRefList(BaseDetail):
    model = models.Search
    template_name = "lit/reference_list.html"

    def get_object(self, **kwargs):
        obj = get_object_or_404(models.Search,
                                slug=self.kwargs.get(self.slug_url_kwarg),
                                assessment=self.kwargs.get('pk'))
        return super(SearchRefList, self).get_object(object=obj)

    def get_context_data(self, **kwargs):
        context = super(SearchRefList, self).get_context_data(**kwargs)
        context['ref_objs'] = self.object.get_all_reference_tags()
        context['object_type'] = 'search'
        context['tags'] = models.ReferenceFilterTag.get_all_tags(self.assessment)
        context['untagged'] = self.object.references_untagged_count
        return context


class SearchTagsVisualization(BaseDetail):
    model = models.Search
    template_name = "lit/reference_visual.html"

    def get_object(self, **kwargs):
        obj = get_object_or_404(models.Search,
                                slug=self.kwargs.get(self.slug_url_kwarg),
                                assessment=self.kwargs.get('pk'))
        return super(SearchTagsVisualization, self).get_object(object=obj)

    def get_context_data(self, **kwargs):
        context = super(SearchTagsVisualization, self).get_context_data(**kwargs)
        context['object_type'] = 'search'
        context['ref_objs'] = self.object.get_all_reference_tags()
        context['tags'] = models.ReferenceFilterTag.get_all_tags(self.assessment)
        return context


class RefList(BaseList):
    parent_model = Assessment
    model = models.Reference

    def get_context_data(self, **kwargs):
        context = super(RefList, self).get_context_data(**kwargs)
        context['object_type'] = 'reference'
        context['ref_objs'] = models.Reference.get_full_assessment_json(self.assessment)
        context['tags'] = models.ReferenceFilterTag.get_all_tags(self.assessment)
        context['untagged'] = models.Reference.get_untagged_references(self.assessment).count()
        return context


class RefListExtract(BaseList):
    parent_model = Assessment
    model = models.Reference
    crud = 'Update' # update-level permission required despite list-view
    template_name = 'lit/reference_extract_list.html'

    def get_queryset(self):
        return self.model.get_references_ready_for_import(self.assessment)


class RefDetail(BaseDetail):
    model = models.Reference

    def get_context_data(self, **kwargs):
        context = super(RefDetail, self).get_context_data(**kwargs)
        context['tags'] = models.ReferenceFilterTag.get_all_tags(self.assessment)
        context['object_json'] = self.object.get_json()
        return context


class RefSearch(AssessmentPermissionsMixin, FormView):
    template_name = 'lit/reference_search.html'
    form_class = forms.ReferenceSearchForm

    def dispatch(self, *args, **kwargs):
        self.assessment = get_object_or_404(Assessment, pk=kwargs['pk'])
        return super(RefSearch, self).dispatch(*args, **kwargs)

    def get_form_kwargs(self):
        kwargs = super(FormView, self).get_form_kwargs()
        kwargs['assessment_pk'] = self.assessment.pk
        return kwargs

    def form_valid(self, form):
        refs = form.search()
        return HttpResponse(json.dumps({"status": "success",
                                        "refs": refs}),
                            content_type="application/json")

    def get_context_data(self, **kwargs):
        context = super(FormView, self).get_context_data(**kwargs)
        context['assessment'] = self.assessment
        context['obj_perms'] = super(RefSearch, self).get_obj_perms()
        context['tags'] = models.ReferenceFilterTag.get_all_tags(self.assessment)
        return context


class RefsJSON(BaseDetail):
    model = Assessment

    def get(self, request, *args, **kwargs):
        self.object = self.get_object()
        pks = self.request.GET.getlist('pks[]')
        response = self.get_refs(pks)
        return HttpResponse(json.dumps(response), content_type="application/json")

    def get_refs(self, pks):
        response = {"status": "success", "refs": []}
        try:
            pks = [int(pk) for pk in pks]
            self.queryset = models.Reference.objects.filter(pk__in=pks, assessment=self.assessment)
            for ref in self.queryset:
                response["refs"].append(ref.get_json(json_encode=False))
        except:
            response["status"] = "fail"
        return response


class RefVisualization(BaseDetail):
    model = Assessment
    template_name = "lit/reference_visual.html"

    def get_context_data(self, **kwargs):
        context = super(RefVisualization, self).get_context_data(**kwargs)
        context['object_type'] = 'reference'
        context['ref_objs'] = models.Reference.get_full_assessment_json(self.assessment)
        context['tags'] = models.ReferenceFilterTag.get_all_tags(self.assessment)
        return context


class TagsJSON(BaseDetail):
    model = Assessment

    def get_object(self, **kwargs):
        obj = get_object_or_404(self.model, pk=self.request.GET.get('pk'))
        return super(TagsJSON, self).get_object(object=obj)

    def get(self, request, *args, **kwargs):
        self.object = self.get_object()
        tags = models.ReferenceFilterTag.get_all_tags(self.object)
        return HttpResponse(json.dumps(tags), content_type="application/json")


class TagsUpdate(BaseUpdate):
    """
    Update tags for an assessment. Note that right now, only project managers
    of the assessment can update tags. (we use the Assessment as the model in an
    update-view, which only project-managers have permission to do-so).
    """
    model = Assessment
    template_name = "lit/tags_update.html"

    def get_context_data(self, **kwargs):
        context = super(TagsUpdate, self).get_context_data(**kwargs)
        context['tags'] = models.ReferenceFilterTag.get_all_tags(self.assessment)
        return context

    def post(self, request, *args, **kwargs):
        if self.request.is_ajax():
            self.object = self.get_object()
            response = self.post_update_ReferenceFilterTag({"status": "success"})
            return HttpResponse(json.dumps(response), content_type="application/json")
        else:
            raise Http404

    def post_update_ReferenceFilterTag(self, response):
        try:
            status = self.request.POST.get('status')
            if status == "add":
                parent_pk = self.request.POST.get('parent_pk', None)
                name = self.request.POST.get('name')
                response["node"] = models.ReferenceFilterTag.add_tag(self.assessment.pk, name, parent_pk)
            elif status == "remove":
                pk = self.request.POST.get('pk', None)
                models.ReferenceFilterTag.remove_tag(self.assessment.pk, pk)
            elif status == "move":
                tag = get_object_or_404(models.ReferenceFilterTag, pk=self.request.POST.get('pk', -1))
                offset = int(self.request.POST.get('offset'))
                tag.move_within_parent(self.assessment.pk, offset)
            else:
                raise Exception()
        except:
            response["status"] = "fail"
        return response


class TagsCopy(AssessmentPermissionsMixin, MessageMixin, FormView):
    """
    Remove exiting tags and copy all tags from a separate assessment.
    """
    template_name = "lit/tags_copy.html"
    form_class = forms.TagsCopyForm
    success_message = 'Literature tags for this assessment have been updated'

    def dispatch(self, *args, **kwargs):
        self.assessment = get_object_or_404(Assessment, pk=kwargs['pk'])
        self.permission_check_user_can_edit()
        return super(TagsCopy, self).dispatch(*args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super(TagsCopy, self).get_context_data(**kwargs)
        context['assessment'] = self.assessment
        return context

    def get_form_kwargs(self):
        kwargs = super(TagsCopy, self).get_form_kwargs()
        kwargs['user'] = self.request.user
        kwargs['assessment'] = self.assessment
        return kwargs

    def form_valid(self, form):
        form.copy_tags()
        return super(TagsCopy, self).form_valid(form)

    def get_success_url(self):
        return reverse_lazy('lit:tags_update', kwargs={'pk': self.assessment.pk})